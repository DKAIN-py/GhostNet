import logging
import random
from typing import Any, Dict

log = logging.getLogger("autonet.agent.emergency_dispatch.fetcher")


class DispatchDataFetcher:
    """
    Dynamic 112 CAD Telemetry Provider.
    Generates sector-customized, randomized 112 distress call kinematics using bounded Gaussian distributions.
    """

    @staticmethod
    async def fetch_dispatch_metrics(sector_id: str) -> Dict[str, Any]:
        """Generates dynamic 112 dispatch telemetry tailored to sector traffic and density profiles."""

        if sector_id == "DEL_SWEST_MHP":  # Mahipalpur / Airport Arterial Hub
            baseline = 8
            # Simulate high-risk highway collision/surge profile
            calls = max(4, int(random.gauss(38, 10)))
            active_units = max(5, int(random.gauss(18, 4)))
            avg_resp_time = round(max(8.0, random.gauss(18.4, 3.0)), 1)
            backlog = max(0, int(random.gauss(11, 4)))
            category = "traffic_collision_and_medical"
            corridor = "NH-48 Mahipalpur Flyover & IGI Airport Approach Road"
            agencies = ["CATSAmbulance", "DelhiTrafficPolice"]

        elif sector_id in ("DEL_NORTH_KGATE", "DEL_CENTRAL_CP"):  # Dense Transit Hubs
            baseline = 10
            calls = max(5, int(random.gauss(28, 8)))
            active_units = max(6, int(random.gauss(15, 3)))
            avg_resp_time = round(max(6.0, random.gauss(14.0, 2.5)), 1)
            backlog = max(0, int(random.gauss(6, 3)))
            category = "traffic_collision"
            corridor = f"{sector_id.replace('DEL_', '')} Central Arterial Crossing"
            agencies = ["DelhiTrafficPolice", "DelhiFireService"]

        elif sector_id in ("DEL_ONORTH_BAWANA", "DEL_SEAST_OKHLA"):  # Industrial Belts
            baseline = 5
            calls = max(2, int(random.gauss(18, 6)))
            active_units = max(4, int(random.gauss(10, 3)))
            avg_resp_time = round(max(10.0, random.gauss(20.0, 4.0)), 1)
            backlog = max(0, int(random.gauss(5, 2)))
            category = "fire"
            corridor = f"{sector_id.replace('DEL_', '')} Industrial Access Corridor"
            agencies = ["DelhiFireService", "CATSAmbulance"]

        else:
            # Nominal Baseline Profile for generic sectors
            baseline = 6
            calls = max(1, int(random.gauss(7, 3)))
            active_units = max(2, int(random.gauss(5, 2)))
            avg_resp_time = round(max(5.0, random.gauss(9.5, 2.0)), 1)
            backlog = max(0, int(random.gauss(1, 1)))
            category = "medical"
            corridor = "Local Sector Feeder Arterial"
            agencies = ["CATSAmbulance"]

        return {
            "callVolumePerMin": calls,
            "baselineCallVolumeMin": baseline,
            "activeDispatches": active_units,
            "primaryCallCategory": category,
            "avgResponseTimeMins": avg_resp_time,
            "dispatchQueueBacklog": backlog,
            "incidentHotspotCorridor": corridor,
            "crossAgencyEscalation": agencies,
        }