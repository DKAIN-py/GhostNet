import asyncio
from dotenv import load_dotenv
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import socketio
import httpx
import os

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .corridor_model import CorridorModel
from .corridor_api_fetcher import CorridorFetcher
from Cascade_Engine.sector_state_store import SectorStateStore

load_dotenv()

log = logging.getLogger("autonet.agent.road_corridor")

from global_config import TOMTOM_API_KEY


class GenericRoadCorridorAgent(BaseAgent):
    """
    Agent 5: Arterial Corridor Congestion Agent (road_corridor)
    Monitors non-bus vehicular traffic speeds, choke points, and average delay times on major corridors.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        store: SectorStateStore,
        poll_interval: int = 60,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "road_corridor"
        self.domain = "transit"
        self.store = store

        # HTTP client kept solely for external TomTom/telemetry API calls
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] RoadCorridorAgent active for %s", self.config.sector_id, self.config.name)

    async def stop(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        if self._http_client:
            await self._http_client.aclose()

    async def _run_loop(self) -> None:
        # Domain phase offset + sector jitter stagger to avoid request bursts
        domain_base_delay = 20.0  # Road Corridor domain phase offset
        node_hash = hash(f"{self.config.sector_id}_{self.agent_id}")
        sector_jitter = (node_hash % 250) / 10.0
        await asyncio.sleep(domain_base_delay + sector_jitter)

        while True:
            try:
                await self.step()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.exception("[%s] [%s] Iteration error: %s", self.config.sector_id, self.agent_id, exc)

            await asyncio.sleep(self.poll_interval)

    async def step(self) -> Dict[str, Any] | None:
        """Executes one step: Fetch Telemetry -> Process Corridor Kinematics -> Dispatch Signal via Socket.io."""
        if not self._http_client:
            return None

        # 1. Ingest Telemetry via external HTTP API
        telemetry = await CorridorFetcher.fetch_corridor_kinematics(
            client=self._http_client,
            sector_id=self.config.sector_id,
            free_flow_speed_kmh=self.config.free_flow_speed_kmh,
            lat=self.config.lat,
            lng=self.config.lng,
            api_key=TOMTOM_API_KEY,
        )

        curr_speed = telemetry["currentAvgSpeedKmh"]
        free_flow = telemetry["freeFlowSpeedKmh"]

        # 2. Derive Kinematics & Health Metrics
        congestion_pct = CorridorModel.calculate_congestion_level_pct(curr_speed, free_flow)
        delay_index_mins = CorridorModel.calculate_avg_delay_index_mins(curr_speed, free_flow)
        pred_speed_20m = CorridorModel.predict_speed_in_20_mins(curr_speed, congestion_pct)
        bus_infiltration = CorridorModel.classify_bus_infiltration(congestion_pct)
        health_score, anomaly_level = CorridorModel.calculate_health_score(curr_speed, free_flow, congestion_pct)

        corridor_name = f"{self.config.primary_corridor_name} ({self.config.name})"
        jam_km = telemetry["jamLengthMeters"] / 1000.0
        upstream_sector = self.config.upstream_sector_id or "DEL_SOUTH_HK"

        # 3. Format Payload matching ROAD_CORRIDOR_SCHEMA Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"{congestion_pct:.1f}% Congestion",
            "signal": (
                f"Severe congestion on {corridor_name} ({curr_speed:.1f} km/h vs {free_flow:.1f} km/h free flow). "
                f"{jam_km:.1f}km queue spilling towards {upstream_sector}."
                if anomaly_level == "critical"
                else f"Traffic moving smoothly at {curr_speed:.1f} km/h along {corridor_name}."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": f"{self.config.name} Arterial Corridor",
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": self.config.radius_meters,
            },
            "metrics": {
                "corridorName": corridor_name,
                "freeFlowSpeedKmh": free_flow,
                "currentAvgSpeedKmh": curr_speed,
                "congestionLevelPct": congestion_pct,
                "jamLengthMeters": telemetry["jamLengthMeters"],
                "bottleneckType": telemetry["bottleneckType"],
                "avgDelayIndexMins": delay_index_mins,
            },
            "corridorForecast": {
                "predictedSpeedIn20Mins": pred_speed_20m,
                "upstreamSpilloverSector": upstream_sector,
                "busCorridorInfiltration": bus_infiltration,
                "recommendedBypassRoute": self.config.recommended_bypass_route,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)

        # 4. Dispatch Signal via Shared Socket.io Connection
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping road corridor signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Road corridor socket dispatch failed: %s", self.config.sector_id, e)

        return payload