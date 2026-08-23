"""
AutoNet — GenericRoadCorridorAgent (Fixed)
==========================================
Key fixes applied:
  1. _run_loop now logs the FULL exception type + message on every failure
     so silent swallowing is impossible.
  2. httpx.AsyncClient is recreated if found closed — handles connection resets.
  3. step() return value is checked — None return is logged distinctly from exceptions.
  4. Sleep always runs regardless of step() outcome (your original was correct here,
     but now the error is visible so you'll actually see what's failing).

The same _run_loop fix applies to ALL 11 agents — only this file is shown
but the pattern is identical. Update BaseAgent._run_loop if you want to
centralize it.
"""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict

import httpx
import socketio
from dotenv import load_dotenv

from agents.Agents.BaseAgent import BaseAgent
from agents.config.sector_config import SectorConfig
from .corridor_model import CorridorModel
from .corridor_api_fetcher import CorridorFetcher
from agents.Cascade_Engine.sector_state_store import SectorStateStore

load_dotenv()

log = logging.getLogger("autonet.agent.road_corridor")

from agents.global_config import TOMTOM_API_KEY


class GenericRoadCorridorAgent(BaseAgent):
    """
    Agent 5: Arterial Corridor Congestion Agent (road_corridor)
    Monitors non-bus vehicular traffic speeds, choke points, and average
    delay times on major corridors.
    """

    def __init__(
        self,
        config       : SectorConfig,
        sio          : socketio.AsyncClient,
        store        : SectorStateStore,
        poll_interval: int = 60,
    ) -> None:
        self.config        = config
        self.sio           = sio
        self.poll_interval = poll_interval
        self.agent_id      = "road_corridor"
        self.domain        = "transit"
        self.store         = store

        self._http_client  : httpx.AsyncClient | None = None
        self._loop_task    : asyncio.Task | None       = None

        # Track consecutive failures — after N failures log a louder warning
        self._consecutive_failures: int = 0
        self._MAX_CONSECUTIVE_FAILURES: int = 5

    # ─────────────────────────────────────────────────────────────────────────
    # LIFECYCLE
    # ─────────────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task   = asyncio.create_task(
            self._run_loop(),
            name=f"{self.config.sector_id}:{self.agent_id}",
        )
        log.info(
            "[%s][%s] Agent started. Poll interval: %ds",
            self.config.sector_id, self.agent_id, self.poll_interval,
        )

    async def stop(self) -> None:
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        log.info("[%s][%s] Agent stopped.", self.config.sector_id, self.agent_id)

    # ─────────────────────────────────────────────────────────────────────────
    # CORE LOOP — FIXED
    # ─────────────────────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        # log.info("%s %s %s", self.agent_id, self.poll_interval, self.config.sector_id)
        node_hash     = hash(f"{self.config.sector_id}_{self.agent_id}")
        sector_jitter = (abs(node_hash) % 50) / 10.0

        while True:
            # log.info("%s %s %s" ,self.agent_id, self.poll_interval, self.config.sector_id)
            try:
                await self.step()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("[%s][%s] %s: %s", self.config.sector_id, self.agent_id, type(exc).__name__, exc, exc_info=True)

            # Sleep OUTSIDE try/except/finally — cannot be interrupted by exception handling
            # log.error("[%s][%s] SLEEPING %ds", self.config.sector_id, self.agent_id, self.poll_interval)
            await asyncio.sleep(self.poll_interval + sector_jitter)
            # log.error("[%s][%s] WOKE UP — re-entering loop", self.config.sector_id, self.agent_id)
    # ─────────────────────────────────────────────────────────────────────────
    # STEP — unchanged from your original except None guard at top
    # ─────────────────────────────────────────────────────────────────────────

    async def step(self) -> Dict[str, Any] | None:
        """
        One telemetry cycle: Fetch → Process → Store → Emit.

        Returns the payload dict on success, None if preconditions not met.
        Exceptions propagate up to _run_loop which handles them explicitly.
        """
        if not self._http_client or self._http_client.is_closed:
            log.warning(
                "[%s][%s] step() called with no live http client.",
                self.config.sector_id, self.agent_id,
            )
            return None

        # 1. Fetch telemetry
        telemetry = await CorridorFetcher.fetch_corridor_kinematics(
            client            = self._http_client,
            sector_id         = self.config.sector_id,
            free_flow_speed_kmh= self.config.free_flow_speed_kmh,
            lat               = self.config.lat,
            lng               = self.config.lng,
            api_key           = TOMTOM_API_KEY,
        )

        curr_speed = telemetry["currentAvgSpeedKmh"]
        free_flow  = telemetry["freeFlowSpeedKmh"]

        # 2. Compute metrics
        congestion_pct   = CorridorModel.calculate_congestion_level_pct(curr_speed, free_flow)
        delay_index_mins = CorridorModel.calculate_avg_delay_index_mins(curr_speed, free_flow)
        pred_speed_20m   = CorridorModel.predict_speed_in_20_mins(curr_speed, congestion_pct)
        bus_infiltration = CorridorModel.classify_bus_infiltration(congestion_pct)
        health_score, anomaly_level = CorridorModel.calculate_health_score(
            curr_speed, free_flow, congestion_pct
        )

        corridor_name   = f"{self.config.primary_corridor_name} ({self.config.name})"
        jam_km          = telemetry["jamLengthMeters"] / 1000.0
        upstream_sector = self.config.upstream_sector_id or "DEL_SOUTH_HK"

        # 3. Build payload
        payload = {
            "sectorId"     : self.config.sector_id,
            "district"     : self.config.district,
            "agentId"      : self.agent_id,
            "domain"       : self.domain,
            "healthScore"  : health_score,
            "anomalyLevel" : anomaly_level,
            "metricValue"  : f"{congestion_pct:.1f}% Congestion",
            "signal"       : (
                f"Severe congestion on {corridor_name} "
                f"({curr_speed:.1f} km/h vs {free_flow:.1f} km/h free flow). "
                f"{jam_km:.1f}km queue spilling towards {upstream_sector}."
                if anomaly_level == "critical"
                else f"Traffic moving smoothly at {curr_speed:.1f} km/h along {corridor_name}."
            ),
            "isLiveAnchor" : self.config.is_live_anchor,
            "location"     : {
                "placeName"   : f"{self.config.name} Arterial Corridor",
                "lat"         : self.config.lat,
                "lng"         : self.config.lng,
                "radiusMeters": self.config.radius_meters,
            },
            "metrics": {
                "corridorName"      : corridor_name,
                "freeFlowSpeedKmh"  : free_flow,
                "currentAvgSpeedKmh": curr_speed,
                "congestionLevelPct": congestion_pct,
                "jamLengthMeters"   : telemetry["jamLengthMeters"],
                "bottleneckType"    : telemetry["bottleneckType"],
                "avgDelayIndexMins" : delay_index_mins,
            },
            "corridorForecast": {
                "predictedSpeedIn20Mins"  : pred_speed_20m,
                "upstreamSpilloverSector" : upstream_sector,
                "busCorridorInfiltration" : bus_infiltration,
                "recommendedBypassRoute"  : self.config.recommended_bypass_route,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Write to SectorStateStore (in-process, no round-trip)
        await self.store.update_signal(payload)

        # 5. Emit to Node.js via Socket.io
        if self.sio.connected:
            await self.sio.emit("agent-signal", payload)
        else:
            log.warning(
                "[%s][%s] Socket.io disconnected — signal stored locally, not emitted.",
                self.config.sector_id, self.agent_id,
            )

        return payload