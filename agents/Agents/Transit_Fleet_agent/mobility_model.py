# domain/mobility_model.py
from typing import Tuple, Dict, Any


class MobilityModel:
    """
    Pure domain physics for GTFS bus fleet kinematics, stationary ratios,
    corridor stagnation, and timetable schedule delay projections.
    """

    @staticmethod
    def calculate_stationary_ratio(stopped_buses: int, total_active_buses: int) -> float:
        """Calculates fraction of active fleet moving slower than 1.4 m/s (~5 km/h)."""
        if total_active_buses <= 0:
            return 0.0
        ratio = stopped_buses / total_active_buses
        return round(min(1.0, max(0.0, ratio)), 3)

    @staticmethod
    def calculate_avg_speed_mps(stationary_ratio: float) -> float:
        """Estimates mean fleet speed in m/s based on stationary ratio."""
        # Free-flow bus speed ~ 8.5 m/s (~30.6 km/h)
        base_speed = 8.5 * (1.0 - stationary_ratio)
        return round(max(0.4, base_speed), 2)

    @staticmethod
    def calculate_route_delay_mins(stationary_ratio: float, active_buses: int) -> float:
        """Projects cumulative timetable schedule delay added across sector routes."""
        if stationary_ratio < 0.25:
            return round(stationary_ratio * 15.0, 1)

        delay = (stationary_ratio * 45.0) + (active_buses * 0.2)
        return round(min(120.0, delay), 1)

    @staticmethod
    def classify_gridlock_risk(stationary_ratio: float, avg_speed_mps: float) -> str:
        """Classifies transit corridor congestion severity."""
        if stationary_ratio >= 0.65 or avg_speed_mps <= 1.0:
            return "CRITICAL"
        if stationary_ratio >= 0.40 or avg_speed_mps <= 2.2:
            return "WARNING"
        return "NOMINAL"

    @staticmethod
    def calculate_health_score(stationary_ratio: float, gridlock_risk: str) -> Tuple[int, str]:
        """Calculates normalized Health Score [0 = Critical, 100 = Optimal]."""
        if stationary_ratio < 0.20:
            score = 92
        elif stationary_ratio < 0.38:
            score = 68
        elif stationary_ratio < 0.55:
            score = 42
        elif stationary_ratio < 0.70:
            score = 25
        else:
            score = 10

        if gridlock_risk == "CRITICAL":
            score = min(score, 22)

        level = "nominal" if score >= 70 else "warning" if score >= 40 else "critical"
        return score, level