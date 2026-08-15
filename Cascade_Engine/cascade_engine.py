"""
AutoNet — Cascade Engine
=========================
Standalone orchestration class (not a BaseAgent subclass).
Reasons: it has no SectorConfig, no poll_interval parity with agents,
and no step() — it runs on its own 30-minute evaluation rhythm
and reads from the shared SectorStateStore rather than an external API.

Lifecycle mirrors BaseAgent externally (start / stop) so main.py
can treat it uniformly, but internally it's its own thing.

Author  : AutoNet Systems Team
Runtime : Python 3.11+ | httpx | Pydantic v2 | python-socketio
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import socketio

from Cascade_Engine.sector_state_store import SectorRecord, SectorStateStore
from Cascade_Engine.cascade_prompts import (
    SECTOR_ALERT_SYSTEM_PROMPT,
    CITY_ROLLUP_SYSTEM_PROMPT,
    SectorCascadeAlert,
    CityCascadeRollup,
    build_sector_alert_prompt,
    build_city_rollup_prompt,
    sector_alert_response_format,
    city_rollup_response_format,
)

log = logging.getLogger("autonet.cascade_engine")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

LLAMA_SERVER_BASE_URL  : str   = "http://localhost:8080/v1"
LLAMA_MODEL_ID         : str   = "qwen2.5-coder-7b-instruct"
EVALUATION_INTERVAL_S  : int   = 30 * 60   # 30 minutes
UNHEALTHY_THRESHOLD    : int   = 35
RECOVERY_THRESHOLD     : int   = 65
CITY_CASCADE_TRIGGER   : int   = 3

LLM_TEMPERATURE        : float = 0.15
LLM_MAX_TOKENS         : int   = 1024
LLM_TOP_P              : float = 0.90

EVENT_CASCADE_ALERT    : str   = "cascade-alert"
EVENT_CASCADE_CLEAR    : str   = "cascade-clear"
EVENT_CITY_CASCADE     : str   = "city-cascade"


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — LLM CLIENT
# ─────────────────────────────────────────────────────────────────────────────

class QwenLLMClient:
    """
    Thin async wrapper around llama-server's OpenAI-compatible endpoint.
    Uses httpx directly — no openai SDK, no extra dependencies.

    response_format with JSON Schema → llama-server converts to GBNF grammar
    → token-level constraint → output is always schema-valid JSON.
    """

    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._client = http_client

    async def structured_query(
        self,
        system_prompt   : str,
        user_prompt     : str,
        response_format : dict[str, Any],
        label           : str = "query",
    ) -> dict[str, Any] | None:
        """
        POST to llama-server and return parsed JSON dict.

        Fallback chain:
          1. json.loads on raw content
          2. Strip markdown fences, retry json.loads
          3. Return None — caller handles gracefully, never crashes
        """
        payload = {
            "model"          : LLAMA_MODEL_ID,
            "temperature"    : LLM_TEMPERATURE,
            "max_tokens"     : LLM_MAX_TOKENS,
            "top_p"          : LLM_TOP_P,
            "response_format": response_format,
            "messages"       : [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
        }

        try:
            response = await self._client.post(
                f"{LLAMA_SERVER_BASE_URL}/chat/completions",
                json    = payload,
                timeout = httpx.Timeout(120.0),
            )
            response.raise_for_status()

            raw = response.json()["choices"][0]["message"]["content"]
            log.debug("[%s] LLM raw (%d chars): %s...", label, len(raw), raw[:100])

            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
                try:
                    return json.loads(cleaned)
                except json.JSONDecodeError as e:
                    log.error("[%s] JSON parse failed: %s | raw: %s", label, e, raw[:200])
                    return None

        except httpx.TimeoutException:
            log.error("[%s] LLM request timed out.", label)
        except httpx.HTTPStatusError as exc:
            log.error("[%s] llama-server HTTP %d.", label, exc.response.status_code)
        except Exception as exc:
            log.exception("[%s] LLM client error: %s", label, exc)

        return None


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — CASCADE ENGINE
# ─────────────────────────────────────────────────────────────────────────────

class CascadeEngine:
    """
    Standalone cascade orchestration engine.

    Not a BaseAgent subclass — no SectorConfig, no external API polling.
    Exposes start() / stop() so main.py lifespan can manage it uniformly
    alongside the BaseAgent instances.

    Reads from SectorStateStore (written by agents in-process).
    Emits cascade-alert / cascade-clear / city-cascade via shared sio client.
    """

    def __init__(
        self,
        store      : SectorStateStore,
        sio        : socketio.AsyncClient,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._store        = store
        self._sio          = sio
        self._llm          = QwenLLMClient(http_client)
        self._loop_task    : asyncio.Task | None = None
        self._incident_seq : int = 0

        log.info(
            "CascadeEngine ready. interval=%dmin | unhealthy<%d | recovery>%d | cityTrigger=%d",
            EVALUATION_INTERVAL_S // 60,
            UNHEALTHY_THRESHOLD,
            RECOVERY_THRESHOLD,
            CITY_CASCADE_TRIGGER,
        )

    # ── Lifecycle (mirrors BaseAgent interface) ────────────────────────────────

    async def start(self) -> None:
        """Launch the evaluation loop as a background asyncio Task."""
        if self._loop_task and not self._loop_task.done():
            log.warning("CascadeEngine.start() called but loop already running.")
            return
        self._loop_task = asyncio.create_task(
            self._run_loop(), name="cascade_engine"
        )
        log.info("CascadeEngine started.")

    async def stop(self) -> None:
        """Cancel the evaluation loop and wait for clean exit."""
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        log.info("CascadeEngine stopped.")

    # ── Internal loop ─────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        """
        Continuous evaluation loop.
        Runs run_evaluation_cycle() every EVALUATION_INTERVAL_S seconds.
        Errors in individual cycles are caught — loop never crashes.
        """
        log.info(
            "CascadeEngine loop running. Next evaluation in %d minutes.",
            EVALUATION_INTERVAL_S // 60,
        )
        while True:
            try:
                await self.run_evaluation_cycle()
            except asyncio.CancelledError:
                log.info("CascadeEngine loop cancelled.")
                break
            except Exception as exc:
                log.exception("Unexpected error in cascade cycle: %s", exc)

            await asyncio.sleep(EVALUATION_INTERVAL_S)

    # ── Socket.io emit ─────────────────────────────────────────────────────────

    async def _emit(self, event: str, data: dict[str, Any]) -> None:
        try:
            await self._sio.emit(event, data)
            log.info(
                "Emitted '%s' → sector/incident: %s",
                event,
                data.get("sectorId") or data.get("incident_id", "city"),
            )
        except Exception as exc:
            log.error("Socket.io emit failed for '%s': %s", event, exc)

    # ── Sector evaluation ──────────────────────────────────────────────────────

    async def _evaluate_sector(self, record: SectorRecord) -> SectorCascadeAlert | None:
        history     = await self._store.get_sector_history(record.sector_id)
        user_prompt = build_sector_alert_prompt(record.to_dict(), history)

        raw = await self._llm.structured_query(
            system_prompt   = SECTOR_ALERT_SYSTEM_PROMPT,
            user_prompt     = user_prompt,
            response_format = sector_alert_response_format(),
            label           = f"sector:{record.sector_id}",
        )
        if raw is None:
            return None

        raw.setdefault("sector_id", record.sector_id)

        try:
            alert = SectorCascadeAlert.model_validate(raw)
            log.info(
                "Sector alert → %s | severity=%s | confidence=%.2f",
                alert.sector_id, alert.severity, alert.confidence_score,
            )
            return alert
        except Exception as exc:
            log.error("SectorCascadeAlert validation failed: %s | raw=%s", exc, raw)
            return None

    async def _handle_cascade_alert(self, record: SectorRecord) -> None:
        log.info(
            "Running Qwen2.5 on sector %s (score=%d, domain=%s)...",
            record.sector_id, record.health_score, record.domain,
        )
        alert = await self._evaluate_sector(record)
        if alert is None:
            return

        await self._store.mark_sector_alerting(record.sector_id)

        payload = {
            **alert.model_dump(),
            "sectorId"    : record.sector_id,
            "district"    : record.district,
            "healthScore" : record.health_score,
            "anomalyLevel": record.anomaly_level,
            "metricValue" : record.metric_value,
            "signal"      : record.signal,
            "location"    : record.location,
            "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        await self._emit(EVENT_CASCADE_ALERT, payload)

    async def _handle_cascade_clear(self, record: SectorRecord) -> None:
        await self._store.mark_sector_clear(record.sector_id)
        payload = {
            "sectorId"    : record.sector_id,
            "district"    : record.district,
            "healthScore" : record.health_score,
            "anomalyLevel": record.anomaly_level,
            "signal"      : f"Sector {record.sector_id} recovered. Score: {record.health_score}.",
            "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        await self._emit(EVENT_CASCADE_CLEAR, payload)
        log.info("Cascade CLEARED → %s (score=%d)", record.sector_id, record.health_score)

    # ── City rollup ────────────────────────────────────────────────────────────

    async def _evaluate_city_rollup(self, active_alerts: list[SectorRecord]) -> None:
        self._incident_seq += 1
        log.warning(
            "CITY CASCADE — %d sectors alerting. Incident #%d. Running rollup...",
            len(active_alerts), self._incident_seq,
        )

        raw = await self._llm.structured_query(
            system_prompt   = CITY_ROLLUP_SYSTEM_PROMPT,
            user_prompt     = build_city_rollup_prompt(
                [r.to_dict() for r in active_alerts],
                self._incident_seq,
            ),
            response_format = city_rollup_response_format(),
            label           = f"city:incident_{self._incident_seq}",
        )
        if raw is None:
            log.error("City rollup LLM returned None — city-cascade not emitted.")
            return

        try:
            rollup = CityCascadeRollup.model_validate(raw)
        except Exception as exc:
            log.error("CityCascadeRollup validation failed: %s | raw=%s", exc, raw)
            return

        payload = {
            **rollup.model_dump(),
            "activeSectorCount": len(active_alerts),
            "sectors"          : [r.to_dict() for r in active_alerts],
            "timestamp"        : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        await self._emit(EVENT_CITY_CASCADE, payload)
        log.warning(
            "City cascade emitted → %s | level=%s | ETA=%dmin",
            rollup.incident_id, rollup.city_threat_level, rollup.estimated_resolution_mins,
        )

    # ── Main evaluation cycle (public — callable from /trigger-now endpoint) ──

    async def run_evaluation_cycle(self) -> None:
        """
        Single evaluation pass. Called automatically by _run_loop every
        30 minutes, or manually via the /cascade/trigger-now HTTP endpoint.

        Phase 1 — Recovery: clear sectors that healed above RECOVERY_THRESHOLD.
        Phase 2 — Degradation: evaluate new sectors below UNHEALTHY_THRESHOLD.
        Phase 3 — City rollup: if ≥ CITY_CASCADE_TRIGGER sectors alerting,
                  synthesize into city-level incident via Qwen2.5.

        Sector evaluations in Phase 2 run concurrently (asyncio.gather).
        City rollup waits for all sector evals to complete first.
        """
        log.info(
            "=== Cascade evaluation cycle | store=%d sectors ===",
            len(self._store),
        )

        # Phase 1: Recovery
        recovering = await self._store.get_recovering_sectors(RECOVERY_THRESHOLD)
        if recovering:
            log.info("Recovery scan → clearing %d sector(s).", len(recovering))
            await asyncio.gather(*[self._handle_cascade_clear(r) for r in recovering])

        # Phase 2: Degradation — only new (non-alerting) unhealthy sectors
        unhealthy     = await self._store.get_unhealthy_sectors(UNHEALTHY_THRESHOLD)
        new_unhealthy = [r for r in unhealthy if not r.is_alerting]

        if new_unhealthy:
            log.warning(
                "Degradation scan → %d new sector(s) below threshold=%d.",
                len(new_unhealthy), UNHEALTHY_THRESHOLD,
            )
            await asyncio.gather(*[self._handle_cascade_alert(r) for r in new_unhealthy])
        else:
            log.info("Degradation scan → no new unhealthy sectors.")

        # Phase 3: City rollup
        active_alerts = await self._store.get_active_alerts()
        if len(active_alerts) >= CITY_CASCADE_TRIGGER:
            await self._evaluate_city_rollup(active_alerts)
        else:
            log.info(
                "City rollup → %d/%d alerting (need %d). Not triggered.",
                len(active_alerts), len(self._store), CITY_CASCADE_TRIGGER,
            )

        log.info("=== Cascade evaluation cycle complete ===")