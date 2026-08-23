"""
AutoNet — Industrial Hazard Synthetic Data & Model
===================================================
Gaussian-distributed synthetic telemetry for industrial hazard agents.

Real industrial incident data characteristics:
  - 85-90% of monitoring periods: no incident (nominal baseline)
  - Incidents are rare but heavy-tailed when they occur
  - Fire tender deployment is discrete and correlated with incident type
  - Toxic plume presence is binary but correlated with chemical zones

Distribution strategy:
  - Incident occurrence: weighted random choice (rare events)
  - Fire tenders: Poisson approximation via Gaussian (discrete count data)
  - Plume presence: Bernoulli with probability correlated to incident type
  - Containment time: log-normal (skewed right — most incidents resolve fast,
    some drag on for hours)

Author  : AutoNet Systems Team
"""

from __future__ import annotations

import math
import random
from typing import Any, Dict


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — INCIDENT TYPE REGISTRY
# ─────────────────────────────────────────────────────────────────────────────

# Weighted incident distribution — reflects real industrial zone data
# 88% of ticks are nominal, 12% have some form of incident
INCIDENT_WEIGHTS = {
    "none"             : 88,   # normal operation
    "structure_fire"   : 6,    # most common incident type
    "chemical_leak"    : 4,    # less common but higher severity
    "boiler_explosion" : 2,    # rare, high severity
}

# Per incident type: (fire_tenders_mean, fire_tenders_std, plume_probability)
# Fire tenders follow Poisson-like distribution — Gaussian approximation
INCIDENT_PROFILES: dict[str, tuple[float, float, float]] = {
    "none"             : (0.0,  0.0,  0.00),   # no tenders, no plume
    "structure_fire"   : (5.0,  2.0,  0.15),   # moderate response, low plume risk
    "chemical_leak"    : (8.0,  2.5,  0.80),   # heavy response, high plume risk
    "boiler_explosion" : (12.0, 3.0,  0.40),   # maximum response, moderate plume
}

# Industrial zone type modifiers — chemical zones have higher plume probability
ZONE_PLUME_MULTIPLIER: dict[str, float] = {
    "chemical_processing": 1.5,
    "manufacturing"      : 0.8,
    "none"               : 0.5,
}


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — GAUSSIAN SAMPLER HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _gauss_clamp(mean: float, std: float, lo: float, hi: float) -> float:
    for _ in range(10):
        val = random.gauss(mean, std)
        if lo <= val <= hi:
            return val
    return max(lo, min(hi, random.gauss(mean, std)))


def _gauss_int(mean: float, std: float, lo: int, hi: int) -> int:
    return int(round(_gauss_clamp(mean, std, float(lo), float(hi))))


def _weighted_choice(weights: dict[str, int]) -> str:
    population = list(weights.keys())
    counts     = list(weights.values())
    return random.choices(population, weights=counts, k=1)[0]


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — SYNTHETIC TELEMETRY GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class IndustrialHazardSyntheticTelemetry:
    """
    Generates realistic synthetic industrial hazard telemetry.

    Incident occurrence is rare by design (12% of ticks) — matching
    real industrial zone monitoring where most readings are nominal.
    When incidents do occur, their parameters are internally consistent:
    a chemical leak will almost always have a plume, a structure fire rarely will.
    """

    @classmethod
    def generate(
        cls,
        industrial_zone_type: str  = "manufacturing",
        stress_multiplier   : float = 1.0,
    ) -> Dict[str, Any]:
        """
        Generate one synthetic industrial hazard telemetry snapshot.

        Parameters
        ----------
        industrial_zone_type : from SectorConfig.industrial_zone_type
                               ("chemical_processing" | "manufacturing" | "none")
        stress_multiplier    : >1.0 shifts incident probability upward.
                               Use during cascade events when adjacent
                               sectors are already in critical state.

        Returns
        -------
        Dict ready to pass into IndustrialHazardModel.evaluate_hazard()
        """
        # ── Step 1: Sample incident type ──────────────────────────────────────
        # Stress multiplier shifts weight away from "none" toward incidents
        weights = dict(INCIDENT_WEIGHTS)
        if stress_multiplier > 1.0:
            excess        = min(30, int((stress_multiplier - 1.0) * 40))
            weights["none"] = max(50, weights["none"] - excess)
            weights["structure_fire"] += excess // 2
            weights["chemical_leak"]  += excess // 3

        incident_type = _weighted_choice(weights)

        # ── Step 2: Fire tenders — Gaussian around incident profile mean ──────
        tender_mean, tender_std, base_plume_prob = INCIDENT_PROFILES[incident_type]

        if incident_type == "none":
            fire_tenders_deployed = 0
        else:
            fire_tenders_deployed = max(1, _gauss_int(
                tender_mean * stress_multiplier,
                tender_std,
                1, 20,
            ))

        # ── Step 3: Toxic plume — Bernoulli, probability by zone type ─────────
        zone_multiplier = ZONE_PLUME_MULTIPLIER.get(industrial_zone_type, 1.0)
        plume_prob      = min(0.95, base_plume_prob * zone_multiplier * stress_multiplier)
        has_toxic_plume = random.random() < plume_prob

        return {
            "incident_type"        : incident_type,
            "fire_tenders_deployed": fire_tenders_deployed,
            "has_toxic_plume"      : has_toxic_plume,
        }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — HAZARD MODEL (original logic preserved, structure cleaned)
# ─────────────────────────────────────────────────────────────────────────────

class IndustrialHazardModel:
    """
    Pure mathematical model evaluating chemical, fire, and structural
    hazard risk metrics from industrial zone telemetry.
    """

    @staticmethod
    def evaluate_hazard(
        incident_type        : str,
        fire_tenders_deployed: int,
        has_toxic_plume      : bool,
    ) -> Dict[str, Any]:
        """
        Evaluates physical hazard severity, evacuation requirements,
        and health score.

        Parameters
        ----------
        incident_type         : "none" | "structure_fire" | "chemical_leak"
                                | "boiler_explosion"
        fire_tenders_deployed : number of fire tenders on scene
        has_toxic_plume       : whether a chemical plume is drifting
        """
        # ── Nominal baseline ──────────────────────────────────────────────────
        if incident_type == "none" or fire_tenders_deployed == 0:
            return {
                "healthScore"              : 100,
                "anomalyLevel"             : "nominal",
                "hazardSeverityGrade"      : "Category-1",
                "evacuationRadiusMeters"   : 0,
                "roadClosureEnforced"      : False,
                "plumeDriftDirection"      : "None",
                "estimatedContainmentHours": 0.0,
                "evacuationUrgency"        : "NONE",
                "roadDiversionImpact"      : "All access corridors open and clear",
            }

        # ── Severity grade ────────────────────────────────────────────────────
        if incident_type in ("boiler_explosion", "chemical_leak") or fire_tenders_deployed >= 10:
            severity_grade   = "Category-3 (Major)"
            base_radius      = 800
            containment_hrs  = round(2.0 + (fire_tenders_deployed * 0.15), 1)
            urgency          = "IMMEDIATE"
        elif fire_tenders_deployed >= 4:
            severity_grade   = "Category-2"
            base_radius      = 400
            containment_hrs  = round(1.0 + (fire_tenders_deployed * 0.1), 1)
            urgency          = "ADVISORY"
        else:
            severity_grade   = "Category-1"
            base_radius      = 150
            containment_hrs  = 0.5
            urgency          = "NONE"

        # ── Plume radius penalty ──────────────────────────────────────────────
        evacuation_radius = base_radius + (200 if has_toxic_plume else 0)
        road_closure      = evacuation_radius >= 400 or urgency == "IMMEDIATE"

        # ── Health score ──────────────────────────────────────────────────────
        tender_penalty = min(60, fire_tenders_deployed * 5)
        plume_penalty  = 30 if has_toxic_plume else 0
        type_penalty   = 10 if incident_type != "none" else 0

        health_score = max(0, min(100, int(
            100 - tender_penalty - plume_penalty - type_penalty
        )))

        # ── Anomaly level ─────────────────────────────────────────────────────
        if health_score < 30 or urgency == "IMMEDIATE":
            anomaly_level = "critical"
        elif health_score < 75:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        # ── Diversion text ────────────────────────────────────────────────────
        diversion_text = (
            "Primary industrial access routes closed; emergency detours enforced"
            if road_closure else
            "Localized lane restrictions near incident perimeter"
        )

        plume_direction = (
            "South-East towards Transit Corridor"
            if has_toxic_plume else
            "Localized"
        )

        return {
            "healthScore"              : health_score,
            "anomalyLevel"             : anomaly_level,
            "hazardSeverityGrade"      : severity_grade,
            "evacuationRadiusMeters"   : evacuation_radius,
            "roadClosureEnforced"      : road_closure,
            "plumeDriftDirection"      : plume_direction,
            "estimatedContainmentHours": containment_hrs,
            "evacuationUrgency"        : urgency,
            "roadDiversionImpact"      : diversion_text,
        }

    @classmethod
    def evaluate_from_synthetic(
        cls,
        industrial_zone_type: str   = "manufacturing",
        stress_multiplier   : float = 1.0,
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Convenience method: generate synthetic telemetry + evaluate in one call.

        Returns
        -------
        tuple of (raw_telemetry, evaluated_metrics)

        Usage in agent.step():
            telemetry, metrics = IndustrialHazardModel.evaluate_from_synthetic(
                industrial_zone_type = self.config.industrial_zone_type or "manufacturing",
                stress_multiplier    = stress,
            )
        """
        telemetry = IndustrialHazardSyntheticTelemetry.generate(
            industrial_zone_type = industrial_zone_type,
            stress_multiplier    = stress_multiplier,
        )
        metrics = cls.evaluate_hazard(**telemetry)
        return telemetry, metrics