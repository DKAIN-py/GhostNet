import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import socketio

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .capacity_model import HospitalCapacityModel
from .hospital_api_fetcher import HospitalDataFetcher

log = logging.getLogger("autonet.agent.hospital_capacity")


class GenericHospitalCapacityAgent(BaseAgent):
    """
    Agent 9: ICU & Healthcare Capacity Agent (hospital_capacity)
    Monitors regional hospital ICU bed availability, ER surge admissions, and
    oxygen autonomy, enforcing triage ambulance diversion signals during crises.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        poll_interval: int = 40,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "hospital_capacity"
        self.domain = "infrastructure"
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] HospitalCapacityAgent active for %s", self.config.sector_id, self.config.name)

    async def stop(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self) -> None:
        # Domain phase offset + sector jitter
        domain_base_delay = 18.0
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
        """Executes one iteration: Fetch Telemetry -> Calculate Model -> Format Payload -> Emit Socket."""

        # 1. Fetch Capacity Data from simulation driver
        data = await HospitalDataFetcher.fetch_hospital_metrics(self.config.sector_id)

        facility_name = data["facilityName"]
        total_icu = data["totalIcuBeds"]
        avail_icu = data["availableIcuBeds"]
        resp_surge = data["respiratoryAdmissionsHourly"]
        lmo_hours = data["oxygenReserveHours"]
        vents_in_use = data["erVentilatorsInUse"]
        amb_queue = data["ambulanceAmbulatoryQueue"]
        secondary_facility = data["secondaryTarget"]

        # 2. Run Math Calculations
        metrics_eval = HospitalCapacityModel.evaluate_capacity(
            total_icu_beds=total_icu,
            available_icu_beds=avail_icu,
            respiratory_admissions_hourly=resp_surge,
            oxygen_reserve_hours=lmo_hours,
            er_ventilators_in_use=vents_in_use,
            ambulance_queue=amb_queue,
        )

        # 3. Construct Payload adhering strictly to HOSPITAL_CAPACITY_SCHEMA
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": metrics_eval["healthScore"],
            "anomalyLevel": metrics_eval["anomalyLevel"],
            "metricValue": f"{metrics_eval['icuOccupancyPct']}% ICU Occupancy",
            "signal": (
                f"Critical ICU capacity at {facility_name} ({metrics_eval['icuOccupancyPct']}% occupied, "
                f"{avail_icu} beds left). Respiratory surge ({resp_surge}/hr) forcing ambulance diversion."
                if metrics_eval["anomalyLevel"] == "critical"
                else f"ICU capacity nominal at {facility_name} ({avail_icu} beds available)."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": f"{facility_name} Emergency Complex",
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 500,
            },
            "metrics": {
                "primaryFacilityName": facility_name,
                "totalIcuBeds": total_icu,
                "availableIcuBeds": avail_icu,
                "icuOccupancyPct": metrics_eval["icuOccupancyPct"],
                "erVentilatorsInUse": vents_in_use,
                "respiratoryAdmissionsHourly": resp_surge,
                "oxygenReserveHours": lmo_hours,
                "ambulanceAmbulatoryQueue": amb_queue,
            },
            "healthcareForecast": {
                "estimatedTimeToIcuSaturationHours": metrics_eval["estimatedTimeToIcuSaturationHours"],
                "triageDivertingActive": metrics_eval["triageDivertingActive"],
                "secondaryFacilityTarget": secondary_facility,
                "primaryTriggerVector": "Environmental PM2.5 Smog Surge",
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 4. Emit Payload to Central Gateway
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io disconnected, dropping hospital capacity signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Hospital capacity socket dispatch error: %s", self.config.sector_id, e)

        return payload