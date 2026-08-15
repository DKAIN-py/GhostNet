import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import httpx
import socketio

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .advisory_data_fetcher import AdvisoryDataFetcher
from .advisory_model import TrafficAdvisoryModel

log = logging.getLogger("autonet.agent.traffic_news")


class GenericMuncipalAdvisoryAgent(BaseAgent):
    """
    Agent 12: Municipal Advisory & News Agent (traffic_news)
    Parses official police advisories, news RSS feeds, and transit broadcasts
    to monitor human-orchestrated roadblocks and diversions.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        poll_interval: int = 45,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "traffic_news"
        self.domain = "civic"

        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] TrafficNewsAgent active for %s", self.config.sector_id, self.config.name)

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
        # Domain phase offset + sector jitter (Civic domain execution window)
        domain_base_delay = 27.0
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
        """Executes one iteration: Fetch Advisory -> Evaluate Math Model -> Format Payload -> Emit Socket."""
        if not self._http_client:
            return None

        # 1. Fetch Advisory Telemetry
        data = await AdvisoryDataFetcher.fetch_advisory_metrics(
            client=self._http_client,
            sector_id=self.config.sector_id,
            is_live_anchor=self.config.is_live_anchor,
        )

        source_type = data["sourceType"]
        closure_type = data["closureType"]
        closure_severity = data["closureSeverity"]
        advisory_id = data["officialAdvisoryId"]
        verified = data["verifiedByPolice"]
        corridors = data["affectedCorridors"]
        duration_hrs = data["estimatedDurationHours"]

        # Derive secondary choke sectors
        upstream_id = getattr(self.config, "upstream_sector_id", "DEL_CENTRAL_CP")
        secondary_sectors = data.get("secondaryChokeSectors") or [upstream_id, "DEL_NEW_KHAN"]

        # 2. Derive Math & Anomaly Evaluation
        eval_metrics = TrafficAdvisoryModel.evaluate_advisory(
            closure_type=closure_type,
            closure_severity=closure_severity,
            affected_corridors_count=len(corridors),
            estimated_duration_hours=duration_hrs,
            verified_by_police=verified,
        )

        place_name = f"{corridors[0] if corridors else self.config.name} Interchange"

        # 3. Construct Payload adhering strictly to TRAFFIC_NEWS_SCHEMA
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": eval_metrics["healthScore"],
            "anomalyLevel": eval_metrics["anomalyLevel"],
            "metricValue": f"{closure_severity.replace('_', ' ').title()}",
            "signal": (
                f"Official Advisory: {closure_type.replace('_', ' ').title()} at {place_name}. "
                f"{', '.join(corridors[:2])} blocked; DTC buses rerouted via adjacent corridors."
                if eval_metrics["anomalyLevel"] != "nominal"
                else f"Municipal traffic advisories nominal across {self.config.name}."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": place_name,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 650,
            },
            "metrics": {
                "sourceType": source_type,
                "closureType": closure_type,
                "closureSeverity": closure_severity,
                "officialAdvisoryId": advisory_id,
                "verifiedByPolice": verified,
                "affectedCorridors": corridors,
                "estimatedDurationHours": duration_hrs,
            },
            "advisoryForecast": {
                "unannouncedDiversionRisk": eval_metrics["unannouncedDiversionRisk"],
                "publicTransitRerouteActive": eval_metrics["publicTransitRerouteActive"],
                "secondaryChokeSectors": secondary_sectors,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Dispatch Signal via Socket.io
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io disconnected, dropping traffic news signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Traffic news socket emit error: %s", self.config.sector_id, e)

        return payload