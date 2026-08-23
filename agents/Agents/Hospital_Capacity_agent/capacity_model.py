"""
AutoNet — Hospital Capacity Synthetic Data Generator
=====================================================
Uses Gaussian (normal) distributions to produce realistic ICU telemetry.

Why Gaussian?
  Real hospital metrics are not uniformly random. ICU occupancy in Delhi
  typically hovers around 65-75% on normal days, with occasional spikes
  during pollution events or disease outbreaks. A Gaussian distribution
  naturally models this "clusters around a mean, rare extremes" behaviour.

  random.uniform(0, 100)  → every value equally likely — unrealistic
  random.gauss(70, 12)    → most values near 70, rare values near 94 or 46

Author  : AutoNet Systems Team
"""

from __future__ import annotations

import random
import math
from typing import Any, Dict


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — GAUSSIAN SAMPLER HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _gauss_clamp(mean: float, std: float, lo: float, hi: float) -> float:
    """
    Sample from a Gaussian distribution and clamp to [lo, hi].
    Re-samples if the value lands outside 3 standard deviations
    to avoid hard-clamping distorting the distribution shape.
    """
    for _ in range(10):
        val = random.gauss(mean, std)
        if lo <= val <= hi:
            return val
    # Fallback after 10 misses — just clamp
    return max(lo, min(hi, random.gauss(mean, std)))


def _gauss_int(mean: float, std: float, lo: int, hi: int) -> int:
    return int(round(_gauss_clamp(mean, std, lo, hi)))


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — SYNTHETIC TELEMETRY GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class HospitalSyntheticTelemetry:
    """
    Generates realistic synthetic hospital telemetry using Gaussian distributions.

    Baseline distributions calibrated against Delhi public health data:
      - AIIMS/major hospitals: higher baseline occupancy, more ICU beds
      - Smaller district hospitals: lower bed count, more volatile occupancy

    Each call produces one snapshot — call repeatedly to simulate time series.
    """

    # ── Normal operating baselines ────────────────────────────────────────────
    # ICU occupancy in Delhi major hospitals averages ~68% on normal days
    # Source: NHP Delhi hospital utilisation reports
    ICU_OCCUPANCY_MEAN     : float = 68.0   # percent
    ICU_OCCUPANCY_STD      : float = 10.0   # ±10% covers most days

    # Respiratory admissions per hour — baseline ~3-4, spikes during AQI events
    RESP_ADMISSIONS_MEAN   : float = 3.5
    RESP_ADMISSIONS_STD    : float = 1.8

    # Oxygen reserve — well-stocked hospitals maintain 36-48h reserves
    OXYGEN_RESERVE_MEAN    : float = 38.0   # hours
    OXYGEN_RESERVE_STD     : float = 8.0

    # Ventilator usage — baseline ~55% of available units in use
    VENTILATOR_USAGE_MEAN  : float = 0.55   # fraction of total
    VENTILATOR_USAGE_STD   : float = 0.12

    # Ambulance queue — 2-4 waiting is normal, 10+ is a surge signal
    AMBULANCE_QUEUE_MEAN   : float = 3.0
    AMBULANCE_QUEUE_STD    : float = 2.5

    @classmethod
    def generate(
        cls,
        baseline_icu_beds    : int   = 100,
        stress_multiplier    : float = 1.0,   # >1.0 = pollution/event stress
    ) -> Dict[str, Any]:
        """
        Generate one synthetic telemetry snapshot.

        Parameters
        ----------
        baseline_icu_beds  : total ICU beds in this hospital (from SectorConfig)
        stress_multiplier  : scales occupancy and admissions upward during
                             events (e.g. 1.3 during severe smog days).
                             Normal days: 1.0. Crisis days: up to 1.5.

        Returns
        -------
        Dict ready to pass into HospitalCapacityModel.evaluate_capacity()
        """
        total_icu_beds = max(10, baseline_icu_beds)

        # ── ICU occupancy — Gaussian around baseline, stress shifts mean up ───
        # During stress, mean shifts from 68% toward 85%
        occupancy_mean = min(95.0, cls.ICU_OCCUPANCY_MEAN * stress_multiplier)
        occupancy_pct  = _gauss_clamp(occupancy_mean, cls.ICU_OCCUPANCY_STD, 20.0, 99.0)

        occupied_beds      = int(round(total_icu_beds * occupancy_pct / 100.0))
        available_icu_beds = max(0, total_icu_beds - occupied_beds)

        # ── Respiratory admissions — Poisson-like via Gaussian approximation ──
        # Stress multiplier raises admission rate (AQI spike → more lung cases)
        resp_mean    = cls.RESP_ADMISSIONS_MEAN * stress_multiplier
        resp_std     = cls.RESP_ADMISSIONS_STD  * stress_multiplier
        respiratory_admissions_hourly = max(0, _gauss_int(resp_mean, resp_std, 0, 25))

        # ── Oxygen reserve — inversely correlated with occupancy ──────────────
        # Higher occupancy depletes oxygen faster → lower reserve
        oxygen_depletion   = (occupancy_pct - 50.0) / 100.0   # -0.3 to +0.49
        oxygen_mean_adj    = cls.OXYGEN_RESERVE_MEAN - (oxygen_depletion * 20.0)
        oxygen_reserve_hrs = _gauss_clamp(oxygen_mean_adj, cls.OXYGEN_RESERVE_STD, 2.0, 72.0)

        # ── Ventilators — correlated with ICU occupancy ───────────────────────
        ventilator_usage_frac = _gauss_clamp(
            cls.VENTILATOR_USAGE_MEAN + (occupancy_pct - 68.0) / 200.0,
            cls.VENTILATOR_USAGE_STD,
            0.10, 1.00,
        )
        # Assume 40% of ICU beds have a ventilator
        total_ventilators       = max(1, int(total_icu_beds * 0.40))
        er_ventilators_in_use   = int(round(total_ventilators * ventilator_usage_frac))

        # ── Ambulance queue — rises with respiratory admissions and occupancy ─
        queue_mean    = cls.AMBULANCE_QUEUE_MEAN + (respiratory_admissions_hourly * 0.3)
        ambulance_queue = max(0, _gauss_int(queue_mean, cls.AMBULANCE_QUEUE_STD, 0, 30))

        return {
            "total_icu_beds"               : total_icu_beds,
            "available_icu_beds"           : available_icu_beds,
            "respiratory_admissions_hourly": respiratory_admissions_hourly,
            "oxygen_reserve_hours"         : round(oxygen_reserve_hrs, 1),
            "er_ventilators_in_use"        : er_ventilators_in_use,
            "ambulance_queue"              : ambulance_queue,
        }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — CAPACITY MODEL (unchanged logic, cleaner structure)
# ─────────────────────────────────────────────────────────────────────────────

class HospitalCapacityModel:
    """
    Pure mathematical model evaluating hospital ICU capacity,
    oxygen reserves, and ER surge pressure.
    """

    @staticmethod
    def evaluate_capacity(
        total_icu_beds                : int,
        available_icu_beds            : int,
        respiratory_admissions_hourly : int,
        oxygen_reserve_hours          : float,
        er_ventilators_in_use         : int,
        ambulance_queue               : int,
    ) -> Dict[str, Any]:
        """
        Calculates healthcare health score, ICU saturation forecast,
        and ambulance diversion necessity.
        """
        total_icu_beds = max(1, total_icu_beds)

        # 1. Occupancy percentage
        occupied_beds    = total_icu_beds - available_icu_beds
        icu_occupancy_pct= round((occupied_beds / total_icu_beds) * 100.0, 1)

        # 2. Time to ICU saturation (hours)
        if available_icu_beds <= 0:
            time_to_saturation = 0.0
        elif respiratory_admissions_hourly > 0:
            # ~25% of severe respiratory admissions require ICU
            icu_conversion_rate = respiratory_admissions_hourly * 0.25
            time_to_saturation  = round(available_icu_beds / icu_conversion_rate, 1) if icu_conversion_rate > 0 else 24.0
        else:
            time_to_saturation = 24.0

        # 3. Health score [0 = critical, 100 = optimal]
        vacant_pct    = (available_icu_beds / total_icu_beds) * 100.0
        base_score    = min(100.0, vacant_pct * 2.5)

        surge_penalty  = min(30.0, respiratory_admissions_hourly * 0.8)
        oxygen_penalty = (
            30.0 if oxygen_reserve_hours < 12.0 else
            15.0 if oxygen_reserve_hours < 24.0 else
            0.0
        )
        queue_penalty  = min(20.0, ambulance_queue * 2.0)

        health_score = max(0, min(100, int(base_score - surge_penalty - oxygen_penalty - queue_penalty)))

        # 4. Anomaly level and diversion trigger
        if health_score < 30 or icu_occupancy_pct >= 90.0 or available_icu_beds <= 15:
            anomaly_level    = "critical"
            triage_diverting = True
        elif health_score < 70 or icu_occupancy_pct >= 75.0:
            anomaly_level    = "warning"
            triage_diverting = icu_occupancy_pct >= 85.0
        else:
            anomaly_level    = "nominal"
            triage_diverting = False

        return {
            "icuOccupancyPct"                   : icu_occupancy_pct,
            "healthScore"                        : health_score,
            "anomalyLevel"                       : anomaly_level,
            "estimatedTimeToIcuSaturationHours"  : time_to_saturation,
            "triageDivertingActive"              : triage_diverting,
        }

    @classmethod
    def evaluate_from_synthetic(
        cls,
        baseline_icu_beds  : int   = 100,
        stress_multiplier  : float = 1.0,
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Convenience method: generate synthetic telemetry + evaluate in one call.

        Returns
        -------
        tuple of (raw_telemetry, evaluated_metrics)
        So the agent can include both in its payload.

        Usage in agent.step():
            telemetry, metrics = HospitalCapacityModel.evaluate_from_synthetic(
                baseline_icu_beds = self.config.baseline_icu_beds,
                stress_multiplier = self._current_stress_level(),
            )
        """
        telemetry = HospitalSyntheticTelemetry.generate(
            baseline_icu_beds  = baseline_icu_beds,
            stress_multiplier  = stress_multiplier,
        )
        metrics = cls.evaluate_capacity(**telemetry)
        return telemetry, metrics