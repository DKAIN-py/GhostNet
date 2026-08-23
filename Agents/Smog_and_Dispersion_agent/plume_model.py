# domain/plume_model.py
import math
from typing import List, Tuple


class PlumeDispersionModel:
    """Pure domain logic for particulate degradation, stagnation, and downwind vectoring."""

    @staticmethod
    def calculate_health_score(pm25: float, visibility_m: float) -> Tuple[int, str]:
        """Normalizes PM2.5 and atmospheric visibility into a 0-100 Health Score."""
        if pm25 <= 30:
            score = 95
        elif pm25 <= 60:
            score = 80
        elif pm25 <= 120:
            score = 60
        elif pm25 <= 250:
            score = 38
        else:
            score = max(10, int(35 - (pm25 - 250) * 0.1))

        # Atmospheric visibility penalty
        if visibility_m < 500:
            score = max(5, score - 15)

        level = "nominal" if score >= 70 else "warning" if score >= 40 else "critical"
        return score, level

    @staticmethod
    def calculate_stagnation_index(wind_speed_kmh: float) -> float:
        """Calculates atmospheric stagnation [0.0 = High Dispersion, 1.0 = Severe Trapping]."""
        if wind_speed_kmh <= 0:
            return 1.0
        stagnation = math.exp(-0.25 * wind_speed_kmh)
        return round(min(1.0, max(0.05, stagnation)), 2)

    @staticmethod
    def predict_downwind_sectors(
        wind_dir_deg: float,
        wind_speed_kmh: float,
        time_window_mins: float = 45.0
    ) -> Tuple[List[str], float]:
        """
        Projects particulate cloud displacement heading and target sector impact.
        Returns (target_sector_ids, estimated_arrival_minutes).
        """
        # Convert incoming wind origin direction to downwind heading
        downwind_heading = (wind_dir_deg + 180.0) % 360.0

        if 45 <= downwind_heading < 135:
            targets = ["DEL_EAST_PV", "DEL_EAST_MV"]
        elif 135 <= downwind_heading < 225:
            targets = ["DEL_SEAST_NP", "DEL_SEAST_OKHLA"]
        elif 225 <= downwind_heading < 315:
            targets = ["DEL_CENTRAL_CP", "DEL_WEST_RG"]
        else:
            targets = ["DEL_NORTH_KGATE", "DEL_NEAST_SLP"]

        arrival_mins = max(15.0, round(time_window_mins / max(1.0, wind_speed_kmh / 5.0), 1))
        return targets, arrival_mins