import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import socketio

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .dispatch_data_fetcher import DispatchDataFetcher
from .dispatch_model import DispatchKinematicsModel
from Cascade_Engine.sector_state_store import SectorStateStore

log = logging.getLogger("autonet.agent.emergency_dispatch")


class GenericEmergencyDispatchAgent(BaseAgent):
    """
    Agent 10: Emergency Dispatch (112) Agent (emergency_dispatch)
    Tracks the volume and velocity of 112 emergency calls per minute per sector,
    providing immediate physical ground truth prior to official sensor updates.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        store: SectorStateStore,
        poll_interval: int = 30,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "emergency_dispatch"
        self.domain = "civic"
        self.store = store

        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] EmergencyDispatchAgent active for %s", self.config.sector_id, self.config.name)

    async def stop(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self) -> None:
        # Domain phase offset + sector jitter (Civic domain execution window)
        domain_base_delay = 21.0
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
        """Executes one step: Generate Telemetry -> Compute Math Kinematics -> Format Payload -> Dispatch Signal."""

        # 1. Fetch Kinematics Telemetry
        data = await DispatchDataFetcher.fetch_dispatch_metrics(self.config.sector_id)

        calls = data["callVolumePerMin"]
        baseline = data["baselineCallVolumeMin"]
        active_units = data["activeDispatches"]
        category = data["primaryCallCategory"]
        resp_time = data["avgResponseTimeMins"]
        backlog = data["dispatchQueueBacklog"]
        corridor = data["incidentHotspotCorridor"]
        agencies = data["crossAgencyEscalation"]

        # 2. Derive Mathematics & Anomaly Metrics
        eval_metrics = DispatchKinematicsModel.evaluate_dispatch(
            call_volume_per_min=calls,
            baseline_call_volume_min=baseline,
            active_dispatches=active_units,
            avg_response_time_mins=resp_time,
            dispatch_queue_backlog=backlog,
        )

        surge_ratio = eval_metrics["callVelocitySpikeRatio"]

        # 3. Construct Payload strictly matching EMERGENCY_DISPATCH_SCHEMA
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": eval_metrics["healthScore"],
            "anomalyLevel": eval_metrics["anomalyLevel"],
            "metricValue": f"{calls} calls/min ({surge_ratio}x surge)",
            "signal": (
                f"112 Call Surge: {surge_ratio}x baseline ({calls} calls/min) in {self.config.name}. "
                f"Incident vector ({category.replace('_', ' ')}) on {corridor}; {backlog} dispatches backlogged."
                if eval_metrics["anomalyLevel"] == "critical"
                else f"112 Emergency dispatch call volume nominal in {self.config.name} ({calls} calls/min)."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": f"{self.config.name} Arterial Corridor",
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 600,
            },
            "metrics": {
                "callVolumePerMin": calls,
                "baselineCallVolumeMin": baseline,
                "callVelocitySpikeRatio": surge_ratio,
                "activeDispatches": active_units,
                "primaryCallCategory": category,
                "avgResponseTimeMins": resp_time,
                "dispatchQueueBacklog": backlog,
            },
            "dispatchForecast": {
                "firstResponderExhaustion": eval_metrics["firstResponderExhaustion"],
                "predictedResponseTime": eval_metrics["predictedResponseTime"],
                "incidentHotspotCorridor": corridor,
                "crossAgencyEscalation": agencies,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)

        # 4. Emit Payload to Socket.io Pipeline
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io disconnected, dropping emergency dispatch signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Emergency dispatch socket emit error: %s", self.config.sector_id, e)

        return payload