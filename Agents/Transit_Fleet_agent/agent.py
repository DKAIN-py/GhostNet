import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
from dotenv import load_dotenv
import socketio
import httpx

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .mobility_model import MobilityModel
from .gtfs_fetcher import GtfsFetcher

load_dotenv()

log = logging.getLogger("autonet.agent.transit")


class GenericTransitAgent(BaseAgent):
    """
    Agent 4: Bus Fleet Bottleneck Agent (transit_fleet)
    Computes the stationary ratio of public buses on specific routes using GTFS-RT feeds.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        poll_interval: int = 60,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "transit_fleet"
        self.domain = "transit"

        # HTTP client kept solely for external GTFS-RT feed fetching
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] TransitAgent active for %s", self.config.sector_id, self.config.name)

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
        # Domain phase offset + sector jitter
        domain_base_delay = 15.0  # Transit domain phase offset
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
        """Executes one step: Ingest Kinematics -> Calculate Stagnation -> Dispatch Signal via Socket.io."""
        if not self._http_client:
            return None

        # 1. Fetch GTFS Fleet Telemetry (Uses HTTP client for external API)
        fleet = await GtfsFetcher.fetch_fleet_kinematics(
            client=self._http_client,
            sector_id=self.config.sector_id,
            baseline_capacity=self.config.baseline_bus_capacity,
            lat=self.config.lat,
            lng=self.config.lng,
        )

        total_buses = fleet["totalActiveBuses"]
        stopped_buses = fleet["stoppedBuses"]

        # 2. Derive Kinematics & Mobility Physics
        stationary_ratio = MobilityModel.calculate_stationary_ratio(stopped_buses, total_buses)
        avg_speed_mps = MobilityModel.calculate_avg_speed_mps(stationary_ratio)
        route_delay_mins = MobilityModel.calculate_route_delay_mins(stationary_ratio, total_buses)
        gridlock_risk = MobilityModel.classify_gridlock_risk(stationary_ratio, avg_speed_mps)

        # Compute Normalized Health Score
        health_score, anomaly_level = MobilityModel.calculate_health_score(stationary_ratio, gridlock_risk)

        place_name = f"{self.config.name} Transit Corridor"

        # 3. Format Payload matching TRANSIT_FLEET_SCHEMA Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"{stationary_ratio * 100:.1f}% Fleet Stationary",
            "signal": (
                f"Critical fleet gridlock in {self.config.name}: {stationary_ratio * 100:.1f}% of {total_buses} DTC buses stationary (<1.4 m/s). "
                f"{fleet['topChokeRoute']} stalled."
                if anomaly_level == "critical"
                else f"Transit flow nominal across {self.config.name}. Avg bus speed at {avg_speed_mps * 3.6:.1f} km/h."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": place_name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 500,
            },
            "metrics": {
                "totalActiveBuses": total_buses,
                "stoppedBuses": stopped_buses,
                "stationaryRatio": stationary_ratio,
                "avgFleetSpeedMps": avg_speed_mps,
                "affectedRouteCount": fleet["affectedRouteCount"],
                "topChokeRoute": fleet["topChokeRoute"],
            },
            "bottleneckForecast": {
                "avgRouteDelayMins": route_delay_mins,
                "busesInDepotMode": fleet["busesInDepotMode"],
                "transitGridlockRisk": gridlock_risk,
                "spilloverToCorridor": f"{self.config.name} Arterial Junction",
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Dispatch Signal via Shared Socket.io Connection
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping transit signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Transit socket dispatch failed: %s", self.config.sector_id, e)

        return payload