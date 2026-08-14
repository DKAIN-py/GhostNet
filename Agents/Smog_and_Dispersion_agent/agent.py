import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
from dotenv import load_dotenv
import socketio
import httpx
import os

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .api_fetcher import AQIApiFetcher
from .plume_model import PlumeDispersionModel

load_dotenv()

log = logging.getLogger("autonet.agent.smog")


class GenericSmogAgent(BaseAgent):
    """
    Generic Smog & Dispersion Micro-Agent.
    Orchestrates telemetry fetching, plume calculation, and signal dispatch for any sector via Socket.io.
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
        self.agent_id = "smog_dispersion"
        self.domain = "environment"

        # HTTP client kept solely for fetching external AQI telemetry
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] SmogAgent active for %s", self.config.sector_id, self.config.name)

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
        domain_base_delay = 0.0  # Smog domain offset (runs first)
        sector_jitter = (hash(f"{self.config.sector_id}_{self.agent_id}") % 200) / 10.0
        await asyncio.sleep(domain_base_delay + sector_jitter)

        while True:
            try:
                await self.step()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.exception("[%s] Iteration error: %s", self.config.sector_id, exc)

            await asyncio.sleep(self.poll_interval)

    async def step(self) -> Dict[str, Any] | None:
        """Executes a decoupled step: Fetch -> Compute -> Format -> Dispatch via Socket.io."""
        if not self._http_client:
            return None

        # 1. Decoupled Data Fetching (Uses HTTP client for external API)
        station_id = self.config.station_ids.get(self.agent_id)
        if self.config.is_live_anchor and station_id:
            telemetry = await AQIApiFetcher.fetch_station_telemetry(
                client=self._http_client,
                station_id=station_id
            )
        else:
            telemetry = AQIApiFetcher.get_synthetic_fallback()

        # 2. Decoupled Math & Plume Calculations
        health_score, anomaly_level = PlumeDispersionModel.calculate_health_score(
            pm25=telemetry["pm25"],
            visibility_m=telemetry["visibilityMeters"]
        )

        stagnation = PlumeDispersionModel.calculate_stagnation_index(telemetry["windSpeedKmh"])
        telemetry["stagnationIndex"] = stagnation

        target_sectors, arrival_mins = PlumeDispersionModel.predict_downwind_sectors(
            wind_dir_deg=telemetry["windDirectionDeg"],
            wind_speed_kmh=telemetry["windSpeedKmh"]
        )

        # 3. Payload Formatting (AutoNet v2.0 Contract)
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"PM2.5 at {telemetry['pm25']:.1f} µg/m³",
            "signal": (
                f"Severe PM2.5 spike ({telemetry['pm25']:.1f} µg/m³) in {self.config.name}. "
                f"Plume drifting toward {', '.join(target_sectors)}."
                if anomaly_level == "critical"
                else f"AQI nominal across {self.config.district}."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": self.config.name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": self.config.radius_meters,
            },
            "metrics": telemetry,
            "diffusionForecast": {
                "targetSectorIds": target_sectors,
                "estimatedArrivalMins": arrival_mins,
                "projectedAqipIncrease": 35 if anomaly_level == "critical" else 5,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Dispatch Signal via Shared Socket.io Connection
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping smog signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Smog socket dispatch failed: %s", self.config.sector_id, e)

        return payload