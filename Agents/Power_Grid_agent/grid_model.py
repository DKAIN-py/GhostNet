import math
from typing import Any, Dict


class PowerGridModel:
    """Pure mathematical evaluation of substation thermal stress and cascading outages."""

    @staticmethod
    def evaluate_grid_health(
        grid_freq: float,
        substation_mw: float,
        rated_capacity_mw: float = 200.0,
    ) -> Dict[str, Any]:
        # Calculate Transformer Load Percentage
        transformer_load_pct = round((substation_mw / rated_capacity_mw) * 100.0, 1)

        # Determine Tripped Feeders based on overload
        tripped_feeders = 0
        if transformer_load_pct > 90.0:
            tripped_feeders = math.floor((transformer_load_pct - 90.0) / 2.5) + 1

        # Determine Traffic Signal Blackout & Commercial Outage
        traffic_signals_offline = transformer_load_pct >= 95.0 or grid_freq < 49.0
        commercial_blackout = transformer_load_pct >= 98.0 or tripped_feeders >= 3

        # Compute Normalized Health Score [0 to 100]
        freq_penalty = max(0.0, (50.0 - grid_freq) * 40.0)
        load_penalty = max(0.0, (transformer_load_pct - 75.0) * 2.0)
        health_score = max(0, min(100, int(100 - freq_penalty - load_penalty)))

        # Determine Anomaly Level
        if health_score < 30 or traffic_signals_offline:
            anomaly_level = "critical"
        elif health_score < 70:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        # Cascade Trip Risk Projection
        if transformer_load_pct >= 95.0:
            cascade_risk = "EXTREME"
            est_restoration = 90
        elif transformer_load_pct >= 85.0:
            cascade_risk = "HIGH"
            est_restoration = 45
        else:
            cascade_risk = "LOW"
            est_restoration = 0

        return {
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "transformerLoadPct": transformer_load_pct,
            "trippedFeeders": tripped_feeders,
            "trafficSignalsOffline": traffic_signals_offline,
            "commercialBlackout": commercial_blackout,
            "cascadeTripRisk": cascade_risk,
            "estimatedRestorationMins": est_restoration,
        }