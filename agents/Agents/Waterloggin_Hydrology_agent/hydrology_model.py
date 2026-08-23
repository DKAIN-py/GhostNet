# domain/hydrology_model.py
from typing import Dict, Tuple, Any


class HydrologyModel:
    """
    Pure domain physics for urban waterlogging, surface runoff,
    and underpass flood depth projection.
    """

    @staticmethod
    def calculate_drain_capacity_pct(accumulated_rain_24h_mm: float) -> float:
        """
        Calculates remaining municipal drainage absorption capacity (%).
        Saturated ground and debris accumulation cause capacity decay.
        """
        decayed_capacity = 100.0 - (accumulated_rain_24h_mm * 0.65)
        return max(5.0, min(100.0, round(decayed_capacity, 1)))

    @staticmethod
    def calculate_water_depth_cm(
        rainfall_rate_mmhr: float,
        drain_capacity_mmhr: float,
        has_underpass: bool,
        pump_status: str
    ) -> float:
        """
        Calculates standing surface water depth (cm) in the sector.
        Underpasses pool water significantly faster than flat surfaces.
        """
        excess_rain = max(0.0, rainfall_rate_mmhr - drain_capacity_mmhr)

        if excess_rain == 0.0:
            return 0.0

        # Physical pooling multipliers
        underpass_factor = 2.4 if has_underpass else 1.0
        pump_penalty = 1.8 if pump_status in ["partially_failing", "offline"] else 1.0

        depth_cm = (excess_rain * 0.45) * underpass_factor * pump_penalty
        return round(min(120.0, depth_cm), 1)

    @staticmethod
    def predict_30min_depth_cm(
        current_depth_cm: float,
        rainfall_rate_mmhr: float,
        has_underpass: bool
    ) -> float:
        """Projects expected standing water depth 30 minutes into the future."""
        if rainfall_rate_mmhr < 10.0:
            # Receding water
            return max(0.0, round(current_depth_cm * 0.6, 1))

        growth_rate = (rainfall_rate_mmhr / 20.0) * (2.0 if has_underpass else 1.0)
        projected = current_depth_cm + growth_rate * 5.0
        return round(min(150.0, projected), 1)

    @staticmethod
    def calculate_health_score(water_depth_cm: float, underpass_flooded: bool) -> Tuple[int, str]:
        """Calculates normalized Health Score [0 = Critical, 100 = Nominal]."""
        if water_depth_cm < 5.0:
            score = 95
        elif water_depth_cm < 15.0:
            score = 75
        elif water_depth_cm < 30.0:
            score = 45
        elif water_depth_cm < 50.0:
            score = 22
        else:
            score = 10

        if underpass_flooded:
            score = min(score, 18)

        level = "nominal" if score >= 70 else "warning" if score >= 40 else "critical"
        return score, level