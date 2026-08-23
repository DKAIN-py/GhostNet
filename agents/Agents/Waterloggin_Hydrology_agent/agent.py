import asyncio
from dotenv import load_dotenv
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import socketio
import httpx

from agents.Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .hydrology_model import HydrologyModel
from .rain_api_fetcher import RainApiFetcher

from agents.Cascade_Engine.sector_state_store import SectorStateStore

log = logging.getLogger("autonet.agent.waterlogging")


class GenericWaterloggingAgent(BaseAgent):
    """
    Agent 2: Urban Hydrology & Waterlogging Agent (waterlogging_hydrology)
    Measures rain rates vs local drain capacity to predict street water depth in underpasses.
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
        self.agent_id = "waterlogging_hydrology"
        self.domain = "environment"
        self.store = store

        # HTTP client kept solely for external API telemetry fetching
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] WaterloggingAgent active for %s", self.config.sector_id, self.config.name)

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
        domain_base_delay = 5.0  # Hydrology domain offset
        sector_jitter = (hash(f"{self.config.sector_id}_{self.agent_id}") % 300) / 20.0
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
        """Executes one step: Fetch Rain -> Compute Depth -> Format Payload -> Dispatch via Socket.io."""
        if not self._http_client:
            return None

        # 1. Fetch Real-time Rain Telemetry (Uses HTTP client for external API)
        rain_data = await RainApiFetcher.fetch_precipitation(
            client=self._http_client,
            lat=self.config.lat,
            lng=self.config.lng
        )

        rainfall_rate = rain_data["rainfallRateMmHr"]
        accumulated_24h = rain_data["accumulatedRain24hMm"]

        # 2. Derive Drainage & Hydrological Metrics
        drain_cap_pct = HydrologyModel.calculate_drain_capacity_pct(accumulated_24h)

        # Determine pump operational state based on rain load
        if rainfall_rate > 80.0:
            pump_status = "offline"
        elif rainfall_rate > 50.0:
            pump_status = "partially_failing"
        else:
            pump_status = "optimal"

        # Calculate Standing Water Depth
        water_depth_cm = HydrologyModel.calculate_water_depth_cm(
            rainfall_rate_mmhr=rainfall_rate,
            drain_capacity_mmhr=self.config.baseline_drain_capacity_mmhr,
            has_underpass=self.config.has_underpass,
            pump_status=pump_status
        )

        # Evaluate Transit Blockage Threshold (>30cm standing water)
        underpass_flooded = self.config.has_underpass and water_depth_cm >= 30.0
        impassable_for_buses = water_depth_cm >= 30.0

        # Predict 30-Minute Depth Projection
        pred_30m_depth = HydrologyModel.predict_30min_depth_cm(
            current_depth_cm=water_depth_cm,
            rainfall_rate_mmhr=rainfall_rate,
            has_underpass=self.config.has_underpass
        )

        # Compute Normalized Health Score
        health_score, anomaly_level = HydrologyModel.calculate_health_score(
            water_depth_cm=water_depth_cm,
            underpass_flooded=underpass_flooded
        )

        location_name = self.config.underpass_name or f"{self.config.name} Arterial Road"

        # 3. Format Payload matching Schema Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"Water Depth at {water_depth_cm:.1f} cm",
            "signal": (
                f"Severe flash waterlogging ({water_depth_cm:.1f}cm depth) at {location_name}. "
                f"Outfall: {self.config.primary_drain_outfall}. Road impassable."
                if anomaly_level == "critical"
                else f"Hydrological status nominal across {self.config.name}. Drain absorption at {drain_cap_pct}%."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": location_name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 450 if self.config.has_underpass else 750,
            },
            "metrics": {
                "rainfallRateMmHr": rainfall_rate,
                "accumulatedRain24hMm": accumulated_24h,
                "waterDepthCm": water_depth_cm,
                "drainAbsorptionCapPct": drain_cap_pct,
                "underpassFlooded": underpass_flooded,
                "pumpStatus": pump_status,
            },
            "floodForecast": {
                "predictedDepthIn30MinsCm": pred_30m_depth,
                "impassableForBuses": impassable_for_buses,
                "affectedCorridor": f"{location_name} / {self.config.primary_drain_outfall} Corridor",
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)
        # 4. Dispatch Signal via Persistent Socket.io Channel
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping hydrology signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Hydrology socket dispatch failed: %s", self.config.sector_id, e)

        return payload