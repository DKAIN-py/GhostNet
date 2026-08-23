import logging
import random
from typing import Any, Dict

log = logging.getLogger("autonet.agent.hospital_capacity.fetcher")


class HospitalDataFetcher:
    """
    Dynamic Telemetry Provider.
    Since no live public API/dashboard streams real-time Delhi hospital bed/ER telemetry,
    this module generates randomized, realistic operational metrics per sector cycle.
    """

    @staticmethod
    async def fetch_hospital_metrics(sector_id: str) -> Dict[str, Any]:
        """Generates dynamic, randomized hospital capacity telemetry tailored to sector healthcare nodes."""

        if sector_id == "DEL_CENTRAL_DG":  # LNJP Hospital Sector
            facility_name = "Lok Nayak Jai Prakash Narayan (LNJP) Hospital"
            total_icu = 250
            # Simulating high stress: 5 to 25 beds available randomly
            available_icu = max(1, min(40, int(random.gauss(14, 6))))
            resp_surge = max(10, int(random.gauss(32, 8)))
            lmo_hours = round(max(4.0, random.uniform(8.0, 22.0)), 1)
            vents_in_use = max(50, min(total_icu, int(random.gauss(85, 10))))
            amb_queue = max(0, int(random.gauss(8, 3)))
            secondary = "G.B. Pant Hospital / AIIMS Trauma Center"

        elif sector_id in ("DEL_SOUTH_HK", "DEL_SOUTH_SAKET"):  # AIIMS / Safdarjung Hub
            facility_name = "AIIMS & Safdarjung Hospital Emergency Complex"
            total_icu = 320
            available_icu = max(2, min(50, int(random.gauss(25, 8))))
            resp_surge = max(15, int(random.gauss(40, 10)))
            lmo_hours = round(max(6.0, random.uniform(12.0, 30.0)), 1)
            vents_in_use = max(70, min(total_icu, int(random.gauss(110, 15))))
            amb_queue = max(1, int(random.gauss(10, 4)))
            secondary = "Max Super Speciality / Fortis Vasant Kunj"

        elif sector_id == "DEL_NEAST_DG":  # GTB Hospital Sector
            facility_name = "Guru Teg Bahadur (GTB) Hospital"
            total_icu = 180
            available_icu = max(2, min(35, int(random.gauss(16, 5))))
            resp_surge = max(8, int(random.gauss(20, 6)))
            lmo_hours = round(max(5.0, random.uniform(10.0, 24.0)), 1)
            vents_in_use = max(30, min(total_icu, int(random.gauss(60, 8))))
            amb_queue = max(0, int(random.gauss(6, 2)))
            secondary = "Rajiv Gandhi Super Speciality Hospital"

        else:
            # Baseline parameters for generic regional sector hospitals
            facility_name = f"{sector_id.replace('DEL_', '')} Civil Hospital"
            total_icu = 100
            available_icu = max(5, min(80, int(random.gauss(42, 12))))
            resp_surge = max(1, int(random.gauss(6, 3)))
            lmo_hours = round(random.uniform(24.0, 48.0), 1)
            vents_in_use = max(2, min(total_icu, int(random.gauss(18, 5))))
            amb_queue = max(0, int(random.gauss(1, 1)))
            secondary = "Regional Medical Center"

        return {
            "facilityName": facility_name,
            "totalIcuBeds": total_icu,
            "availableIcuBeds": available_icu,
            "erVentilatorsInUse": vents_in_use,
            "respiratoryAdmissionsHourly": resp_surge,
            "oxygenReserveHours": lmo_hours,
            "ambulanceAmbulatoryQueue": amb_queue,
            "secondaryTarget": secondary,
        }