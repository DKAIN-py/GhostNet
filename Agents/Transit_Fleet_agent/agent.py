# Agents/Transit_fleet_agent/agent.py
import asyncio
from dotenv import load_dotenv
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import httpx
import os

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .mobility_model import MobilityModel
from .gtfs_fetcher import GtfsFetcher

load_dotenv()

log = logging.getLogger("autonet.agent.transit")

BACKEND_URL=os.getenv("BACKEND_URL")

class GenericTransitAgent(BaseAgent):
    """
    Agent 4: Bus Fleet Bottleneck Agent (transit_fleet)
    Computes the stationary ratio of public buses on specific routes using GTFS-RT feeds.
    """

    def __init__(
        self,
        config: SectorConfig,
        backend_url: str = BACKEND_URL,
        poll_interval: int = 60,
    ) -> None:
        self.config = config
        self.backend_url = backend_url
        self.poll_interval = poll_interval
        self.agent_id = "transit_fleet"
        self.domain = "transit"

        self._client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] TransitAgent active for %s", self.config.sector_id, self.config.name)

    async def stop(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        if self._client:
            await self._client.aclose()

    async def _run_loop(self) -> None:
        # Multi-variable hash stagger to avoid request bursts
        node_hash = hash(f"{self.config.sector_id}_{self.agent_id}")
        stagger_delay = (node_hash % 250) / 10.0
        await asyncio.sleep(stagger_delay)

        while True:
            try:
                await self.step()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.exception("[%s] [%s] Iteration error: %s", self.config.sector_id, self.agent_id, exc)

            await asyncio.sleep(self.poll_interval)

    async def step(self) -> Dict[str, Any] | None:
        """Executes one step: Ingest Kinematics -> Calculate Stagnation -> Dispatch Signal."""
        if not self._client:
            return None

        # 1. Fetch GTFS Fleet Telemetry
        fleet = await GtfsFetcher.fetch_fleet_kinematics(
            client=self._client,
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

        # 4. Dispatch Signal
        try:
            await self._client.post(self.backend_url, json=payload, timeout=5.0)
        except Exception as e:
            log.error("[%s] Transit signal dispatch failed: %s", self.config.sector_id, e)

        return payload