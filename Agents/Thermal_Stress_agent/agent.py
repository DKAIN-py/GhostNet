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
from .thermal_model import ThermalModel
from .weather_api_fetcher import WeatherApiFetcher

load_dotenv()

log = logging.getLogger("autonet.agent.thermal")


class GenericThermalAgent(BaseAgent):
    """
    Agent 3: Ambient Thermal & Heatwave Agent (thermal_stress)
    Tracks localized urban heat island (UHI) effects and extreme temperature anomalies.
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
        self.agent_id = "thermal_stress"
        self.domain = "environment"

        # HTTP client kept solely for external weather API telemetry calls
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] ThermalAgent active for %s", self.config.sector_id, self.config.name)

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
        domain_base_delay = 10.0  # Thermal domain offset
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
        """Executes one step: Fetch Weather -> Compute UHI & Grid Risk -> Dispatch Signal via Socket.io."""
        if not self._http_client:
            return None

        # 1. Fetch Real-time Thermal Telemetry (Uses HTTP client for external API)
        telemetry = await WeatherApiFetcher.fetch_thermal_telemetry(
            client=self._http_client,
            lat=self.config.lat,
            lng=self.config.lng
        )

        ambient_temp = telemetry["ambientTempC"]
        humidity = telemetry["relativeHumidityPct"]
        solar_irradiance = telemetry["solarIrradianceWm2"]

        # 2. Derive Thermal & UHI Physics Metrics
        feels_like = ThermalModel.calculate_feels_like_c(ambient_temp, humidity)
        surface_temp = ThermalModel.calculate_surface_temp_c(
            ambient_temp, solar_irradiance, self.config.is_concrete_dense
        )
        uhi_delta = ThermalModel.calculate_uhi_delta_c(
            ambient_temp, self.config.uhi_baseline_offset_c, self.config.is_concrete_dense
        )

        # 3. Derive Grid Load Impact & Health Risks
        grid_load_impact = ThermalModel.calculate_grid_load_impact(feels_like)
        transformer_risk = ThermalModel.classify_transformer_trip_risk(feels_like, surface_temp)
        heatstroke_risk = ThermalModel.classify_heatstroke_risk(feels_like)

        # Compute Normalized Health Score
        health_score, anomaly_level = ThermalModel.calculate_health_score(feels_like, transformer_risk)

        place_suffix = " Commercial Zone" if self.config.is_concrete_dense else " Sector Area"
        place_name = f"{self.config.name}{place_suffix}"

        # 4. Format Payload matching Schema Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "metricValue": f"{feels_like:.1f}°C Feels-Like",
            "signal": (
                f"Severe Urban Heat Island spike ({feels_like:.1f}°C feels-like) at {place_name}. "
                f"High grid overload risk & heatstroke hazard."
                if anomaly_level == "critical"
                else f"Thermal conditions nominal across {self.config.name}. Feels-like at {feels_like:.1f}°C."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": place_name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 600 if self.config.is_concrete_dense else 750,
            },
            "metrics": {
                "ambientTempC": ambient_temp,
                "feelsLikeTempC": feels_like,
                "surfaceTempC": surface_temp,
                "uhiIntensityDeltaC": uhi_delta,
                "relativeHumidityPct": humidity,
                "solarIrradianceWm2": solar_irradiance,
            },
            "thermalForecast": {
                "gridLoadImpactPct": grid_load_impact,
                "transformerTripRisk": transformer_risk,
                "heatstrokeRiskIndex": heatstroke_risk,
                "sustainedDurationHours": 6.5 if feels_like > 42.0 else 1.0,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 5. Dispatch Signal via Shared Socket.io Channel
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping thermal signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Thermal socket dispatch failed: %s", self.config.sector_id, e)

        return payload