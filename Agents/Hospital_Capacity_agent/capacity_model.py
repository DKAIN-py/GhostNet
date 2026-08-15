from typing import Any, Dict


class HospitalCapacityModel:
    """Pure mathematical model evaluating hospital ICU capacity, oxygen reserves, and ER surge pressure."""

    @staticmethod
    def evaluate_capacity(
        total_icu_beds: int,
        available_icu_beds: int,
        respiratory_admissions_hourly: int,
        oxygen_reserve_hours: float,
        er_ventilators_in_use: int,
        ambulance_queue: int,
    ) -> Dict[str, Any]:
        """Calculates healthcare health score, ICU saturation forecast, and ambulance diversion necessity."""

        if total_icu_beds <= 0:
            total_icu_beds = 1

        # 1. Occupancy Percentage
        occupied_beds = total_icu_beds - available_icu_beds
        icu_occupancy_pct = round((occupied_beds / total_icu_beds) * 100.0, 1)

        # 2. Time to ICU Saturation (Hours)
        if available_icu_beds <= 0:
            time_to_saturation = 0.0
        elif respiratory_admissions_hourly > 0:
            # Assume ~25% of severe emergency respiratory admissions require ICU beds
            icu_conversion_rate_hourly = respiratory_admissions_hourly * 0.25
            if icu_conversion_rate_hourly > 0:
                time_to_saturation = round(available_icu_beds / icu_conversion_rate_hourly, 1)
            else:
                time_to_saturation = 24.0
        else:
            time_to_saturation = 24.0

        # 3. Health Score Calculation [0 = Critical, 100 = Optimal]
        vacant_pct = (available_icu_beds / total_icu_beds) * 100.0
        base_score = min(100.0, vacant_pct * 2.5)

        surge_penalty = min(30.0, respiratory_admissions_hourly * 0.8)
        oxygen_penalty = 30.0 if oxygen_reserve_hours < 12.0 else (15.0 if oxygen_reserve_hours < 24.0 else 0.0)
        queue_penalty = min(20.0, ambulance_queue * 2.0)

        raw_health_score = base_score - surge_penalty - oxygen_penalty - queue_penalty
        health_score = max(0, min(100, int(raw_health_score)))

        # 4. Anomaly Level Determination & Triage Diversion Trigger
        triage_diverting = False
        if health_score < 30 or icu_occupancy_pct >= 90.0 or available_icu_beds <= 15:
            anomaly_level = "critical"
            triage_diverting = True
        elif health_score < 70 or icu_occupancy_pct >= 75.0:
            anomaly_level = "warning"
            triage_diverting = icu_occupancy_pct >= 85.0
        else:
            anomaly_level = "nominal"

        return {
            "icuOccupancyPct": icu_occupancy_pct,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "estimatedTimeToIcuSaturationHours": time_to_saturation,
            "triageDivertingActive": triage_diverting,
        }