import math
from typing import Any, Dict


class IndustrialHazardModel:
    """Pure mathematical model evaluating chemical, fire, and structural hazard risk metrics."""

    @staticmethod
    def evaluate_hazard(
        incident_type: str,
        fire_tenders_deployed: int,
        has_toxic_plume: bool,
    ) -> Dict[str, Any]:
        """
        Evaluates physical hazard severity, evacuation requirements, and health score.

        incident_type: 'none' | 'structure_fire' | 'chemical_leak' | 'boiler_explosion'
        """
        if incident_type == "none" or fire_tenders_deployed == 0:
            return {
                "healthScore": 100,
                "anomalyLevel": "nominal",
                "hazardSeverityGrade": "Category-1",
                "evacuationRadiusMeters": 0,
                "roadClosureEnforced": False,
                "plumeDriftDirection": "None",
                "estimatedContainmentHours": 0.0,
                "evacuationUrgency": "NONE",
                "roadDiversionImpact": "All access corridors open and clear",
            }

        # Determine Hazard Severity Grade
        if incident_type in ("boiler_explosion", "chemical_leak") or fire_tenders_deployed >= 10:
            severity_grade = "Category-3 (Major)"
            base_radius = 800
            containment_hrs = round(2.0 + (fire_tenders_deployed * 0.15), 1)
            urgency = "IMMEDIATE"
        elif fire_tenders_deployed >= 4:
            severity_grade = "Category-2"
            base_radius = 400
            containment_hrs = round(1.0 + (fire_tenders_deployed * 0.1), 1)
            urgency = "ADVISORY"
        else:
            severity_grade = "Category-1"
            base_radius = 150
            containment_hrs = 0.5
            urgency = "NONE"

        # Apply plume penalty to radius
        evacuation_radius = base_radius + (200 if has_toxic_plume else 0)
        road_closure = evacuation_radius >= 400 or urgency == "IMMEDIATE"

        # Calculate Health Score [0 - 100]
        tender_penalty = min(60, fire_tenders_deployed * 5)
        plume_penalty = 30 if has_toxic_plume else 0
        type_penalty = 10 if incident_type != "none" else 0

        health_score = max(0, min(100, int(100 - tender_penalty - plume_penalty - type_penalty)))

        # Determine anomaly level
        if health_score < 30 or urgency == "IMMEDIATE":
            anomaly_level = "critical"
        elif health_score < 75:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        # Diversion Impact Summary
        if road_closure:
            diversion_text = "Primary industrial access routes closed; emergency detours enforced"
        else:
            diversion_text = "Localized lane restrictions near incident perimeter"

        return {
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "hazardSeverityGrade": severity_grade,
            "evacuationRadiusMeters": evacuation_radius,
            "roadClosureEnforced": road_closure,
            "plumeDriftDirection": "South-East towards Transit Corridor" if has_toxic_plume else "Localized",
            "estimatedContainmentHours": containment_hrs,
            "evacuationUrgency": urgency,
            "roadDiversionImpact": diversion_text,
        }