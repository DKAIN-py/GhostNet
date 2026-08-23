import math
from typing import Dict, Any, Tuple


class CorridorModel:
    """Domain physics and kinematic calculations for non-bus arterial road corridors."""

    @staticmethod
    def calculate_congestion_level_pct(current_speed_kmh: float, free_flow_speed_kmh: float) -> float:
        """Computes congestion index percentage [0.0 - 100.0]."""
        if free_flow_speed_kmh <= 0:
            return 0.0
        ratio = 1.0 - (current_speed_kmh / free_flow_speed_kmh)
        return round(max(0.0, min(100.0, ratio * 100.0)), 1)

    @staticmethod
    def calculate_avg_delay_index_mins(
        current_speed_kmh: float, free_flow_speed_kmh: float, segment_length_km: float = 5.0
    ) -> float:
        """Calculates extra travel delay in minutes over a baseline 5 km segment."""
        curr_speed = max(1.0, current_speed_kmh)
        free_flow = max(1.0, free_flow_speed_kmh)

        free_flow_time_mins = (segment_length_km / free_flow) * 60.0
        current_time_mins = (segment_length_km / curr_speed) * 60.0

        return round(max(0.0, current_time_mins - free_flow_time_mins), 1)

    @staticmethod
    def predict_speed_in_20_mins(current_speed_kmh: float, congestion_pct: float) -> float:
        """Projects expected average speed (km/h) 20 minutes into the future based on queue growth."""
        speed_drop_factor = (congestion_pct / 100.0) * 8.0
        return round(max(3.0, current_speed_kmh - speed_drop_factor), 1)

    @staticmethod
    def calculate_health_score(
        current_speed_kmh: float, free_flow_speed_kmh: float, congestion_pct: float
    ) -> Tuple[int, str]:
        """
        Derives normalized health score [0 - 100] and anomaly level.
        Health Score: 0 (Gridlock) to 100 (Optimal Free Flow).
        """
        if free_flow_speed_kmh <= 0:
            return 100, "nominal"

        raw_health = (current_speed_kmh / free_flow_speed_kmh) * 100.0
        health_score = int(round(max(0.0, min(100.0, raw_health))))

        if congestion_pct >= 65.0 or current_speed_kmh <= 15.0:
            anomaly_level = "critical"
        elif congestion_pct >= 35.0:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        return health_score, anomaly_level

    @staticmethod
    def classify_bus_infiltration(congestion_pct: float) -> str:
        """Estimates traffic encroachment risk into dedicated bus/BRT lanes."""
        if congestion_pct > 70.0:
            return "HIGH"
        elif congestion_pct > 40.0:
            return "MEDIUM"
        return "LOW"