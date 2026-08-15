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
from .metero_model import MetroModel
from .metero_fetcher import MetroFetcher
from Cascade_Engine.sector_state_store import SectorStateStore

load_dotenv()

log = logging.getLogger("autonet.agent.metro_transit")

DMRC_API_KEY = os.getenv("DMRC_API_KEY", None)


class GenericMetroTransitAgent(BaseAgent):
    """
    Agent 6: Metro Transit Gate Agent (metro_transit)
    Measures crowd inflow/outflow density and platform crowding at major interchange stations.
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
        self.agent_id = "metro_transit"
        self.domain = "transit"
        self.store = store

        # HTTP client kept solely for external DMRC/telemetry API calls
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] MetroTransitAgent active for %s", self.config.sector_id, self.config.name)

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
        # Domain phase offset (25s base delay) + sector jitter stagger to avoid request bursts
        domain_base_delay = 25.0  # Metro Transit domain phase offset
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
        """Executes one step: Fetch Telemetry -> Process Metro Crowd Densities -> Dispatch Signal via Socket.io."""
        if not self._http_client:
            return None

        # 1. Ingest Telemetry via external DMRC/GTFS API
        telemetry = await MetroFetcher.fetch_station_telemetry(
            client=self._http_client,
            sector_id=self.config.sector_id,
            dmrc_api_key=DMRC_API_KEY,
        )

        inflow_per_min = telemetry["passengerInflowPerMin"]
        active_gates = telemetry["activeGateCount"]

        # 2. Derive Kinematics & Crowd Metrics
        platform_capacity_pct = MetroModel.calculate_platform_capacity_pct(inflow_per_min, active_gates)
        throttled_gates = MetroModel.calculate_throttled_gates(platform_capacity_pct, active_gates)
        avg_wait_mins = MetroModel.calculate_avg_wait_time_mins(platform_capacity_pct, throttled_gates)
        forecast = MetroModel.derive_surge_forecast(platform_capacity_pct, throttled_gates, active_gates)

        health_score, anomaly_level = MetroModel.calculate_health_score(
            platform_capacity_pct, throttled_gates, active_gates, forecast["gateClosureRisk"]
        )

        station_name = f"{self.config.name} Metro Interchange"

        # 3. Format Payload matching METRO_TRANSIT_SCHEMA Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"{platform_capacity_pct:.1f}% Platform Capacity",
            "signal": (
                f"Critical crowding at {station_name} ({platform_capacity_pct:.1f}% platform capacity). "
                f"{throttled_gates} gates throttled; {avg_wait_mins:.1f} min platform wait."
                if anomaly_level == "critical"
                else f"Metro passenger flow nominal at {station_name} ({inflow_per_min} passengers/min)."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": f"{self.config.name} Metro Station Junction",
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 400,
            },
            "metrics": {
                "stationName": station_name,
                "passengerInflowPerMin": inflow_per_min,
                "platformCapacityPct": platform_capacity_pct,
                "activeGateCount": active_gates,
                "throttledGateCount": throttled_gates,
                "avgPlatformWaitMins": avg_wait_mins,
                "lineTransferSurge": telemetry["lineTransferSurge"],
            },
            "surgeForecast": forecast,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)

        # 4. Dispatch Signal via Shared Socket.io Connection
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping metro transit signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Metro transit socket dispatch failed: %s", self.config.sector_id, e)

        return payload