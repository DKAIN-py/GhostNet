from typing import Any, Dict, List


class TrafficAdvisoryModel:
    """Pure mathematical model evaluating human-orchestrated traffic advisories and closure severity."""

    @staticmethod
    def evaluate_advisory(
        closure_type: str,
        closure_severity: str,
        affected_corridors_count: int,
        estimated_duration_hours: float,
        verified_by_police: bool,
    ) -> Dict[str, Any]:
        """Calculates normalized health score, unannounced diversion risk, and secondary sector impacts."""

        if closure_type == "none" or closure_severity == "none":
            return {
                "healthScore": 100,
                "anomalyLevel": "nominal",
                "unannouncedDiversionRisk": "LOW",
                "publicTransitRerouteActive": False,
            }

        # 1. Determine Unannounced Diversion Risk
        if closure_type == "unplanned_protest_roadblock" or closure_severity == "full_zone_lockdown":
            diversion_risk = "HIGH"
            transit_reroute = True
        elif closure_type == "vip_movement" or closure_severity == "major_arterial_blocked":
            diversion_risk = "MEDIUM"
            transit_reroute = True
        else:
            diversion_risk = "LOW"
            transit_reroute = False

        # 2. Calculate Health Score [0 = Critical, 100 = Optimal]
        severity_penalties = {
            "full_zone_lockdown": 65.0,
            "major_arterial_blocked": 45.0,
            "minor_diversion": 20.0,
            "none": 0.0,
        }

        base_penalty = severity_penalties.get(closure_severity, 20.0)
        corridor_penalty = min(20.0, affected_corridors_count * 5.0)
        duration_penalty = min(15.0, estimated_duration_hours * 2.5)
        unplanned_penalty = 10.0 if closure_type == "unplanned_protest_roadblock" else 0.0

        raw_health_score = 100.0 - base_penalty - corridor_penalty - duration_penalty - unplanned_penalty
        health_score = max(0, min(100, int(raw_health_score)))

        # 3. Anomaly Level Determination
        if health_score < 30 or closure_severity == "full_zone_lockdown":
            anomaly_level = "critical"
        elif health_score < 70 or closure_severity == "major_arterial_blocked":
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        return {
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "unannouncedDiversionRisk": diversion_risk,
            "publicTransitRerouteActive": transit_reroute,
        }