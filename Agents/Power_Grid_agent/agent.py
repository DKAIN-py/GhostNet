import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import httpx
import socketio

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .grid_model import PowerGridModel
from .sdlc_api_fetcher import SLDCDataFetcher

log = logging.getLogger("autonet.agent.power_grid")


class GenericPowerGridAgent(BaseAgent):
    """
    Agent 7: Power Substation & Grid Agent (power_grid)
    Monitors regional substation telemetry, grid frequency, transformer load,
    and predicts local outage cascade risks and traffic signal impacts.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        poll_interval: int = 30,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "power_grid"
        self.domain = "infrastructure"

        # HTTP client kept solely for external API / scraper telemetry fetching
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] PowerGridAgent active for %s", self.config.sector_id, self.config.name)

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
        domain_base_delay = 30.0  # Infrastructure / Grid domain offset
        sector_jitter = (hash(f"{self.config.sector_id}_{self.agent_id}") % 250) / 10.0
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
        """Executes one step: Fetch SLDC DOM -> Evaluate Grid Health -> Format Payload -> Dispatch via Socket.io."""
        if not self._http_client:
            return None

        # 1. Fetch Real-time Telemetry (Uses SLDC scraper with shared HTTP client)
        fetcher = SLDCDataFetcher(http_client=self._http_client)
        html_content = await fetcher.fetch_live_html()

        if html_content:
            parsed = fetcher.parse_sldc_html(html_content)
            freq = parsed.get("gridFrequencyHz", 50.0)
            substation_data = parsed.get("substations", {}).get(self.config.name, {})
            substation_mw = substation_data.get("mw", 154.0)
            is_live_anchor = True
        else:
            freq = 49.85
            substation_mw = 185.0
            is_live_anchor = self.config.is_live_anchor

        # 2. Derive Grid Metrics & Health via Pure Physics/Math Model
        grid_eval = PowerGridModel.evaluate_grid_health(
            grid_freq=freq,
            substation_mw=substation_mw,
            rated_capacity_mw=200.0,
        )

        substation_name = f"{self.config.name} 33kV Substation"

        # 3. Format Payload matching Schema Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": grid_eval["healthScore"],
            "anomalyLevel": grid_eval["anomalyLevel"],
            "metricValue": f"{grid_eval['transformerLoadPct']}% Substation Load ({freq}Hz)",
            "signal": (
                f"Critical grid overload at {substation_name} ({grid_eval['transformerLoadPct']}% load). "
                f"Grid frequency at {freq}Hz. Traffic signals offline: {grid_eval['trafficSignalsOffline']}."
                if grid_eval["anomalyLevel"] == "critical"
                else f"Substation load nominal at {grid_eval['transformerLoadPct']}% for {self.config.name}. Frequency stable at {freq}Hz."
            ),
            "isLiveAnchor": is_live_anchor,
            "location": {
                "placeName": substation_name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 700,
            },
            "metrics": {
                "substationName": substation_name,
                "discomProvider": "BSES Rajdhani Power Limited (BRPL)",
                "transformerLoadPct": grid_eval["transformerLoadPct"],
                "gridFrequencyHz": freq,
                "activeFeeders": 12 - grid_eval["trippedFeeders"],
                "trippedFeeders": grid_eval["trippedFeeders"],
                "trafficSignalsOffline": grid_eval["trafficSignalsOffline"],
                "commercialBlackout": grid_eval["commercialBlackout"],
            },
            "gridForecast": {
                "cascadeTripRisk": grid_eval["cascadeTripRisk"],
                "estimatedRestorationMins": grid_eval["estimatedRestorationMins"],
                "trafficSignalImpactZone": f"{self.config.name} Central Junctions",
                "backupPowerActive": not grid_eval["trafficSignalsOffline"],
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Dispatch Signal via Persistent Socket.io Channel
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping power grid signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Power grid socket dispatch failed: %s", self.config.sector_id, e)

        return payload