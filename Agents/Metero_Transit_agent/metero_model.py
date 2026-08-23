import math
from typing import Dict, Any, Tuple


class MetroModel:
    """Domain physics and crowd density calculations for metro interchange stations."""

    @staticmethod
    def calculate_platform_capacity_pct(
        passenger_inflow_per_min: int,
        active_gates: int,
        base_gate_capacity_per_min: float = 120.0
    ) -> float:
        """
        Calculates platform crowding percentage relative to safety limits.
        """
        max_station_throughput = max(1.0, active_gates * base_gate_capacity_per_min)
        capacity_ratio = (passenger_inflow_per_min / max_station_throughput) * 100.0
        return round(max(0.0, min(100.0, capacity_ratio)), 1)

    @staticmethod
    def calculate_throttled_gates(platform_capacity_pct: float, total_gates: int) -> int:
        """
        Determines turnstile gate restrictions required to prevent platform crush conditions.
        """
        if platform_capacity_pct >= 90.0:
            return min(total_gates, max(1, int(total_gates * 0.45)))
        elif platform_capacity_pct >= 75.0:
            return max(1, int(total_gates * 0.25))
        elif platform_capacity_pct >= 60.0:
            return max(0, int(total_gates * 0.10))
        return 0

    @staticmethod
    def calculate_avg_wait_time_mins(platform_capacity_pct: float, throttled_gates: int) -> float:
        """Calculates average boarding wait time based on overcrowding and gate restrictions."""
        base_wait = 3.0
        surge_delay = math.pow(platform_capacity_pct / 100.0, 3) * 15.0
        throttle_delay = throttled_gates * 0.8
        return round(base_wait + surge_delay + throttle_delay, 1)

    @staticmethod
    def derive_surge_forecast(
        platform_capacity_pct: float,
        throttled_gates: int,
        active_gates: int
    ) -> Dict[str, Any]:
        """Projects gate closure risks, time to total entry lock, and surface-to-rail spillover."""
        if platform_capacity_pct >= 90.0:
            gate_closure_risk = "CRITICAL"
            surface_overflow_risk = "SEVERE"
            est_time_to_lock_mins = max(3, int(25 - (platform_capacity_pct - 90.0) * 2))
            overflow_ratio = round(2.5 + (platform_capacity_pct / 100.0), 1)
        elif platform_capacity_pct >= 75.0:
            gate_closure_risk = "HIGH"
            surface_overflow_risk = "MODERATE"
            est_time_to_lock_mins = 25
            overflow_ratio = 2.1
        elif platform_capacity_pct >= 60.0:
            gate_closure_risk = "MEDIUM"
            surface_overflow_risk = "LOW"
            est_time_to_lock_mins = 45
            overflow_ratio = 1.4
        else:
            gate_closure_risk = "LOW"
            surface_overflow_risk = "NONE"
            est_time_to_lock_mins = 120
            overflow_ratio = 1.0

        return {
            "gateClosureRisk": gate_closure_risk,
            "surfaceOverflowRisk": surface_overflow_risk,
            "estimatedTimeToGateLock": est_time_to_lock_mins,
            "roadToRailOverflowRatio": overflow_ratio,
        }

    @staticmethod
    def calculate_health_score(
        platform_capacity_pct: float,
        throttled_gates: int,
        active_gates: int,
        gate_closure_risk: str
    ) -> Tuple[int, str]:
        """
        Derives normalized health score [0 - 100] and anomaly level.
        0 = Critical (Station Overcrowded / Gate Locks Imminent) to 100 = Optimal.
        """
        gate_penalty = (throttled_gates / max(1, active_gates)) * 40.0
        capacity_penalty = platform_capacity_pct * 0.6
        raw_health = 100.0 - (capacity_penalty + gate_penalty)
        health_score = int(round(max(0.0, min(100.0, raw_health))))

        if gate_closure_risk == "CRITICAL" or platform_capacity_pct >= 88.0:
            anomaly_level = "critical"
        elif gate_closure_risk in ["HIGH", "MEDIUM"] or platform_capacity_pct >= 65.0:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        return health_score, anomaly_level