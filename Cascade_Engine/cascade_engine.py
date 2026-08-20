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
    CityCascadeLLMSynthesis,
    build_sector_alert_prompt,
    build_city_rollup_prompt,
    sector_alert_response_format,
    city_rollup_synthesis_response_format,
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
LLM_MAX_TOKENS         : int   = 4096       # General upper cap
LLM_TOP_P              : float = 0.90

EVENT_CASCADE_ALERT    : str   = "cascade-alert"
EVENT_CASCADE_CLEAR    : str   = "cascade-clear"
EVENT_CITY_CASCADE     : str   = "city-cascade"

SECTOR_MAX_TOKEN       : int   = 1024
CITY_MAX_TOKEN         : int   = 4096

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — LLM CLIENT
# ─────────────────────────────────────────────────────────────────────────────

class QwenLLMClient:
    """
    Thin async wrapper around llama-server's OpenAI-compatible endpoint.
    Uses httpx directly — no openai SDK, no extra dependencies.
    """

    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._client = http_client

    async def structured_query(
        self,
        system_prompt   : str,
        user_prompt     : str,
        response_format : dict[str, Any],
        label           : str = "query",
        max_tokens      : int = LLM_MAX_TOKENS,
    ) -> dict[str, Any] | None:
        payload = {
            "model"          : LLAMA_MODEL_ID,
            "temperature"    : LLM_TEMPERATURE,
            "max_tokens"     : max_tokens or LLM_MAX_TOKENS,
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
                timeout = httpx.Timeout(300.0),
            )
            response.raise_for_status()

            print(response)
            res_json = response.json()

            choice = res_json["choices"][0]
            raw = choice["message"]["content"]
            finish_reason = choice.get("finish_reason")
            log.info("[%s] LLM generation completed. finish_reason='%s' | length=%d chars", label, finish_reason, len(raw))
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
    """

    def __init__(
        self,
        store                   : SectorStateStore,
        sio                     : socketio.AsyncClient,
        http_client             : httpx.AsyncClient,
        max_concurrent_llm_calls: int = 3,
    ) -> None:
        self._store        = store
        self._sio          = sio
        self._llm          = QwenLLMClient(http_client)
        self._loop_task    : asyncio.Task | None = None
        self._incident_seq : int = 0
        self._semaphore    = asyncio.Semaphore(max_concurrent_llm_calls)

        log.info(
            "CascadeEngine ready. interval=%dmin | unhealthy<%d | recovery>%d | cityTrigger=%d | maxParallelLLM=%d",
            EVALUATION_INTERVAL_S // 60,
            UNHEALTHY_THRESHOLD,
            RECOVERY_THRESHOLD,
            CITY_CASCADE_TRIGGER,
            max_concurrent_llm_calls,
        )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._loop_task and not self._loop_task.done():
            log.warning("CascadeEngine.start() called but loop already running.")
            return
        self._loop_task = asyncio.create_task(
            self._run_loop(), name="cascade_engine"
        )
        log.info("CascadeEngine started.")

    async def stop(self) -> None:
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        log.info("CascadeEngine stopped.")

    # ── Internal loop ─────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        log.info(
            "CascadeEngine loop initialized. Waiting 30s for initial agent telemetry seeding..."
        )
        await asyncio.sleep(30)

        try:
            log.info("🚀 Executing initial CascadeEngine evaluation cycle on boot...")
            await self.run_evaluation_cycle()
        except asyncio.CancelledError:
            log.info("CascadeEngine loop cancelled during initial evaluation pass.")
            return
        except Exception as exc:
            log.exception("Unexpected error during initial cascade evaluation: %s", exc)

        log.info(
            "Initial cascade evaluation pass complete. Next scheduled evaluation in %d minutes.",
            EVALUATION_INTERVAL_S // 60,
        )

        while True:
            try:
                await asyncio.sleep(EVALUATION_INTERVAL_S)
                await self.run_evaluation_cycle()
            except asyncio.CancelledError:
                log.info("CascadeEngine loop cancelled.")
                break
            except Exception as exc:
                log.exception("Unexpected error in cascade cycle: %s", exc)

    # ── Socket.io emit ─────────────────────────────────────────────────────────

    async def _emit(self, event: str, data: dict[str, Any]) -> None:
        try:
            await self._sio.emit(event, data)
            target_id = data.get("primarySectorId") or data.get("sectorId") or data.get("incidentId", "city")
            log.info("Emitted '%s' → sector/incident: %s", event, target_id)
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
            max_tokens      = SECTOR_MAX_TOKEN,
        )
        if raw is None:
            return None

        raw.setdefault("primarySectorId", record.sector_id)
        raw.setdefault("primarySectorName", record.location.get("placeName", record.district))
        raw.setdefault("district", record.district)

        try:
            alert = SectorCascadeAlert.model_validate(raw)
            log.info(
                "Sector alert → %s | cascadeScore=%.2f | confidence=%d%%",
                alert.primarySectorId, alert.cascadeScore, alert.confidence,
            )
            return alert
        except Exception as exc:
            log.error("SectorCascadeAlert validation failed: %s | raw=%s", exc, raw)
            return None

    async def _handle_cascade_alert(self, record: SectorRecord) -> None:
        log.info(
            "Queuing Qwen2.5 analysis for sector %s (score=%d, domain=%s)...",
            record.sector_id, record.health_score, record.domain,
        )
        async with self._semaphore:
            alert = await self._evaluate_sector(record)

        if alert is None:
            return

        await self._store.mark_sector_alerting(record.sector_id)

        payload = {
            **alert.model_dump(mode="json"),
            "primarySectorId"   : record.sector_id,
            "primarySectorName" : record.location.get("placeName", record.district),
            "district"          : record.district,
            "healthScore"       : record.health_score,
            "anomalyLevel"      : record.anomaly_level,
            "metricValue"       : record.metric_value,
            "signal"            : record.signal,
            "location"          : record.location,
            "timestamp"         : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        await self._emit(EVENT_CASCADE_ALERT, payload)

    async def _handle_cascade_clear(self, record: SectorRecord) -> None:
        await self._store.mark_sector_clear(record.sector_id)
        payload = {
            "primarySectorId": record.sector_id,
            "sectorId"       : record.sector_id,
            "district"       : record.district,
            "healthScore"    : record.health_score,
            "anomalyLevel"   : record.anomaly_level,
            "signal"         : f"Sector {record.sector_id} recovered. Score: {record.health_score}.",
            "timestamp"      : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
            response_format = city_rollup_synthesis_response_format(),
            label           = f"city:incident_{self._incident_seq}",
            max_tokens      = CITY_MAX_TOKEN,
        )
        print(raw)
        if raw is None:
            log.error("City rollup LLM returned None — city-cascade not emitted.")
            return

        try:
            flat_rollup = CityCascadeLLMSynthesis.model_validate(raw)
            print(flat_rollup)
        except Exception as exc:
            log.error("CityCascadeLLMSynthesis validation failed: %s | raw=%s", exc, raw)
            return

        # ─────────────────────────────────────────────────────────────────────
        # DETERMINISTIC CALCULATIONS (DETERMINISTIC RUNTIME OVERRIDES)
        # ─────────────────────────────────────────────────────────────────────

        now = datetime.now(timezone.utc)
        incident_id = f"CITY_INCIDENT_{now.strftime('%Y_%m%d')}_{self._incident_seq:03d}"

        # 1. Composite Citywide Cascade Score (0.00 to 1.00)
        avg_health = sum(r.health_score for r in active_alerts) / max(len(active_alerts), 1)
        cascade_score = round(max(0.0, min(1.0, (100.0 - avg_health) / 100.0)), 2)

        # 2. Composite Severity Level Matching Enum ["NOMINAL", "ELEVATED", "HIGH", "CRITICAL"]
        if cascade_score >= 0.75 or len(active_alerts) >= 5:
            severity = "CRITICAL"
        elif cascade_score >= 0.65:
            severity = "HIGH"
        elif cascade_score >= 0.45:
            severity = "ELEVATED"
        else:
            severity = "NOMINAL"

        # 3. Secondary Sectors Aggregation from Telemetry
        secondary_sectors = [
            r.sector_id for r in active_alerts
            if r.sector_id != flat_rollup.primaryAffectedSectorId
        ][:4]

        # ─────────────────────────────────────────────────────────────────────
        # INFLATE FLATTENED LLM OUTPUT TO STRICT NESTED PAYLOAD SCHEMA
        # ─────────────────────────────────────────────────────────────────────
        root_cause = getattr(flat_rollup.rootCauseDomain, "value", str(flat_rollup.rootCauseDomain))
        priority_val = getattr(flat_rollup.primaryDirectivePriority, "value", str(flat_rollup.primaryDirectivePriority))

        payload = {
            "incidentId"           : incident_id,
            "citywideSeverity"     : severity,
            "citywideCascadeScore" : cascade_score,
            "summary"              : flat_rollup.summary,
            "rootCauseDomain"      : root_cause,
            "affectedAreas"        : [
                {
                    "district"        : flat_rollup.primaryAffectedDistrict,
                    "primarySectorId" : flat_rollup.primaryAffectedSectorId,
                    "secondarySectors": secondary_sectors,
                    "impactedDomains" : [root_cause],
                    "affectedBy"      : {
                        "primaryThreat": flat_rollup.primaryThreatTitle,
                        "description"  : flat_rollup.primaryThreatDetail,
                        "metrics"      : {
                            "activeAlertCount": len(active_alerts),
                            "avgHealthScore"  : round(avg_health, 1),
                        },
                    },
                }
            ],
            "mitigationMeasures"   : {
                "immediateDirectives": [
                    {
                        "action"      : flat_rollup.primaryDirectiveAction,
                        "targetAgency": flat_rollup.primaryDirectiveAgency,
                        "priority"    : priority_val,
                    }
                ],
                "trafficAndTransitRerouting": [
                    {
                        "affectedCorridor" : flat_rollup.criticalCorridor,
                        "bypassRoute"      : flat_rollup.bypassRoute,
                        "transitAdjustment": flat_rollup.transitAdjustment,
                    }
                ],
                "publicAdvisories": [
                    {
                        "channel" : "EMERGENCY_BROADCAST",
                        "headline": flat_rollup.publicHeadline,
                        "message" : flat_rollup.publicMessage,
                    }
                ],
            },
            "timestamp"            : now.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        }

        await self._emit(EVENT_CITY_CASCADE, payload)

        log.warning(
            "City cascade emitted → %s | severity=%s | score=%.2f",
            incident_id, severity, cascade_score,
        )

    # ── Main evaluation cycle ──────────────────────────────────────────────────

    async def run_evaluation_cycle(self) -> None:
        log.info(
            "=== Cascade evaluation cycle | store=%d sectors ===",
            len(self._store),
        )

        # Phase 1: Recovery
        recovering = await self._store.get_recovering_sectors(RECOVERY_THRESHOLD)
        if recovering:
            log.info("Recovery scan → clearing %d sector(s).", len(recovering))
            await asyncio.gather(*[self._handle_cascade_clear(r) for r in recovering])

        # Phase 2: Degradation
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