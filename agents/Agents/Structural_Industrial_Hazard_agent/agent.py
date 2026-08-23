import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import httpx
import socketio

from agents.Agents.BaseAgent import BaseAgent
from agents.config.sector_config import SectorConfig
from .dfs_incident_fetcher import DFSApiFetcher
from .hazard_model import IndustrialHazardModel
from Cascade_Engine.sector_state_store import SectorStateStore

log = logging.getLogger("autonet.agent.industrial_hazard")


class GenericIndustrialHazardAgent(BaseAgent):
    """
    Agent 8: Structural & Industrial Hazard Agent (industrial_hazard)
    Monitors manufacturing complexes and chemical zones for toxic leaks, fires,
    and explosions, calculating perimeter evacuations and road closures.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        store: SectorStateStore,
        poll_interval: int = 45,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "industrial_hazard"
        self.domain = "infrastructure"
        self.store = store

        # HTTP client kept solely for external API telemetry fetching
        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] IndustrialHazardAgent active for %s", self.config.sector_id, self.config.name)

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
        domain_base_delay = 15.0  # Infrastructure hazard domain offset
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
        """Executes one step: Fetch DFS Telemetry -> Evaluate Hazard Math -> Format Payload -> Dispatch Signal."""
        if not self._http_client:
            return None

        # 1. Fetch Incident Telemetry
        dfs_data = await DFSApiFetcher.fetch_incident_data(
            client=self._http_client,
            sector_id=self.config.sector_id,
            is_live_anchor=self.config.is_live_anchor,
            is_industrial_zone=self.config.is_industrial_zone
        )

        incident_type = dfs_data["incidentType"]
        tenders = dfs_data["fireTendersDeployed"]
        toxic_plume = dfs_data["toxicSmokePlume"]
        chemical_agent = dfs_data["activeChemicalAgent"]

        # 2. Derive Hazard Projections & Health Score
        eval_metrics = IndustrialHazardModel.evaluate_hazard(
            incident_type=incident_type,
            fire_tenders_deployed=tenders,
            has_toxic_plume=toxic_plume,
        )

        place_location = f"{self.config.name} Industrial Complex"

        # 3. Format Payload matching Schema Contract
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": eval_metrics["healthScore"],
            "anomalyLevel": eval_metrics["anomalyLevel"],
            "metricValue": f"{eval_metrics['hazardSeverityGrade']} Fire/Hazard",
            "signal": (
                f"Major industrial hazard: {incident_type.replace('_', ' ').title()} in {self.config.name}. "
                f"{tenders} fire tenders deployed; {eval_metrics['evacuationRadiusMeters']}m evacuation zone active."
                if eval_metrics["anomalyLevel"] == "critical"
                else f"Industrial hazard monitoring nominal across {self.config.name} complex."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": place_location,
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": eval_metrics["evacuationRadiusMeters"] or 800,
            },
            "metrics": {
                "zoneType": "Manufacturing & Chemical Industrial Complex",
                "incidentType": incident_type,
                "hazardSeverityGrade": eval_metrics["hazardSeverityGrade"],
                "fireTendersDeployed": tenders,
                "toxicSmokePlume": toxic_plume,
                "activeChemicalAgent": chemical_agent,
                "evacuationRadiusMeters": eval_metrics["evacuationRadiusMeters"],
                "roadClosureEnforced": eval_metrics["roadClosureEnforced"],
            },
            "hazardForecast": {
                "plumeDriftDirection": eval_metrics["plumeDriftDirection"],
                "estimatedContainmentHours": eval_metrics["estimatedContainmentHours"],
                "evacuationUrgency": eval_metrics["evacuationUrgency"],
                "roadDiversionImpact": eval_metrics["roadDiversionImpact"],
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)

        # 4. Dispatch Signal via Persistent Socket.io Channel
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io not connected, dropping industrial hazard signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Industrial hazard socket dispatch failed: %s", self.config.sector_id, e)

        return payload