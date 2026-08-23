"""
AutoNet — Sector State Store
=============================
In-process, thread-safe telemetry buffer for all active sectors.
Agents write directly here after each step() — no Socket.io round-trip.

Keyed by sector_id string (matches SectorConfig.sector_id).
CascadeEngine reads from this store every evaluation cycle.

Author  : AutoNet Systems Team
Runtime : Python 3.11+
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("autonet.sector_store")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — SECTOR RECORD
# ─────────────────────────────────────────────────────────────────────────────

class SectorRecord:
    """
    Latest aggregated state snapshot for one sector.
    Updated in-place on every agent step() emission.
    Multiple agents can write to the same sector — worst health score wins.
    """

    __slots__ = (
        "sector_id", "district", "health_score", "anomaly_level",
        "domain", "agent_id", "metric_value", "signal", "location",
        "is_live_anchor", "is_alerting", "alert_since",
        "last_updated", "raw",
    )

    def __init__(self, data: dict[str, Any]) -> None:
        self.sector_id     : str             = data.get("sectorId", "UNKNOWN")
        self.district      : str             = data.get("district", "Unknown District")
        self.health_score  : int             = int(data.get("healthScore", 100))
        self.anomaly_level : str             = data.get("anomalyLevel", "nominal").lower()
        self.domain        : str             = data.get("domain", "unknown")
        self.agent_id      : str             = data.get("agentId", "unknown")
        self.metric_value  : str             = str(data.get("metricValue", ""))
        self.signal        : str             = data.get("signal", "")
        self.location      : dict            = data.get("location", {})
        self.is_live_anchor: bool            = data.get("isLiveAnchor", False)
        self.is_alerting   : bool            = False
        self.alert_since   : datetime | None = None
        self.last_updated  : datetime        = datetime.now(timezone.utc)
        self.raw           : dict            = data

    def update(self, data: dict[str, Any]) -> None:
        """Merge a fresh agent-signal payload into this record."""
        self.health_score  = int(data.get("healthScore", self.health_score))
        self.anomaly_level = data.get("anomalyLevel", self.anomaly_level).lower()
        self.domain        = data.get("domain", self.domain)
        self.agent_id      = data.get("agentId", self.agent_id)
        self.metric_value  = str(data.get("metricValue", self.metric_value))
        self.signal        = data.get("signal", self.signal)
        self.location      = data.get("location", self.location)
        self.is_live_anchor= data.get("isLiveAnchor", self.is_live_anchor)
        self.last_updated  = datetime.now(timezone.utc)
        self.raw           = data

    def mark_alerting(self) -> None:
        if not self.is_alerting:
            self.is_alerting = True
            self.alert_since = datetime.now(timezone.utc)

    def mark_clear(self) -> None:
        self.is_alerting = False
        self.alert_since = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "sectorId"    : self.sector_id,
            "district"    : self.district,
            "healthScore" : self.health_score,
            "anomalyLevel": self.anomaly_level,
            "domain"      : self.domain,
            "agentId"     : self.agent_id,
            "metricValue" : self.metric_value,
            "signal"      : self.signal,
            "location"    : self.location,
            "isLiveAnchor": self.is_live_anchor,
            "isAlerting"  : self.is_alerting,
            "alertSince"  : self.alert_since.isoformat() if self.alert_since else None,
            "lastUpdated" : self.last_updated.isoformat(),
        }

    def __repr__(self) -> str:
        return (
            f"SectorRecord(id={self.sector_id}, score={self.health_score}, "
            f"agent={self.agent_id}, alerting={self.is_alerting})"
        )


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — STORE
# ─────────────────────────────────────────────────────────────────────────────

class SectorStateStore:
    """
    Central in-memory telemetry buffer.

    Multiple agents per sector write concurrently — protected by asyncio.Lock.
    Worst health score from any agent dominates the sector record so that
    a single critical domain reading doesn't get masked by healthy ones.
    """

    def __init__(self) -> None:
        self._store        : dict[str, SectorRecord] = {}
        self._history      : dict[str, list[dict]]   = defaultdict(list)
        self._history_limit: int                     = 5
        self._lock         : asyncio.Lock            = asyncio.Lock()
        log.info("SectorStateStore initialized.")

    # ── Write ─────────────────────────────────────────────────────────────────

    async def update_signal(self, data: dict[str, Any]) -> SectorRecord | None:
        """
        Upsert a sector record from an agent-signal payload.

        Called directly by each agent's step() — no Socket.io needed.
        Worst health score from any agent dominates so multi-domain
        degradation is never hidden by a healthy sibling agent.
        """
        sector_id = data.get("sectorId")
        if not sector_id:
            log.warning("update_signal called with no sectorId — skipped.")
            return None

        async with self._lock:
            if sector_id in self._store:
                existing       = self._store[sector_id]
                incoming_score = int(data.get("healthScore", 100))
                # Worst score dominates — if incoming is worse, full update
                if incoming_score < existing.health_score:
                    existing.update(data)
                    log.debug(
                        "Sector %s: score degraded %d→%d [%s]",
                        sector_id, existing.health_score,
                        incoming_score, data.get("agentId"),
                    )
                else:
                    # Score not worse — still refresh timestamp so store stays live
                    existing.last_updated = datetime.now(timezone.utc)
            else:
                self._store[sector_id] = SectorRecord(data)
                log.debug("New sector registered in store: %s", sector_id)

            # Ring buffer — last N snapshots per sector for LLM context
            buf = self._history[sector_id]
            buf.append({
                "healthScore" : data.get("healthScore"),
                "anomalyLevel": data.get("anomalyLevel"),
                "agentId"     : data.get("agentId"),
                "signal"      : data.get("signal", "")[:120],
                "timestamp"   : data.get("timestamp"),
            })
            if len(buf) > self._history_limit:
                buf.pop(0)

            return self._store[sector_id]

    async def mark_sector_alerting(self, sector_id: str) -> None:
        async with self._lock:
            if sector_id in self._store:
                self._store[sector_id].mark_alerting()

    async def mark_sector_clear(self, sector_id: str) -> None:
        async with self._lock:
            if sector_id in self._store:
                self._store[sector_id].mark_clear()

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_unhealthy_sectors(self, threshold: int = 35) -> list[SectorRecord]:
        """Sectors below threshold, worst-first. CascadeEngine's primary entry point."""
        async with self._lock:
            result = [r for r in self._store.values() if r.health_score < threshold]
        result.sort(key=lambda r: r.health_score)
        return result

    async def get_active_alerts(self) -> list[SectorRecord]:
        """All sectors currently in cascade-alert state."""
        async with self._lock:
            result = [r for r in self._store.values() if r.is_alerting]
        result.sort(key=lambda r: r.health_score)
        return result

    async def get_recovering_sectors(self, recovery_threshold: int = 65) -> list[SectorRecord]:
        """Alerting sectors that recovered above threshold → emit cascade-clear."""
        async with self._lock:
            result = [
                r for r in self._store.values()
                if r.is_alerting and r.health_score >= recovery_threshold
            ]
        return result

    async def get_sector_history(self, sector_id: str) -> list[dict]:
        async with self._lock:
            return list(self._history.get(sector_id, []))

    async def snapshot(self) -> dict[str, Any]:
        async with self._lock:
            sectors = list(self._store.values())
        total    = len(sectors)
        alerting = sum(1 for s in sectors if s.is_alerting)
        avg      = sum(s.health_score for s in sectors) / total if total else 0
        return {
            "totalSectors" : total,
            "alertingCount": alerting,
            "averageScore" : round(avg, 1),
            "sectors"      : [s.to_dict() for s in sectors],
        }

    def __len__(self) -> int:
        return len(self._store)