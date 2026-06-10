import logging

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("AutoNet.air_quality")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — MATHEMATICAL NORMALIZATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def calculate_health_score(pm25_value: float | None) -> tuple[int, str]:
    """
    Maps a raw PM2.5 reading (µg/m³) onto AutoNet's locked [0–100] health
    schema with a corresponding anomaly level label.

    The three-tier piecewise model is intentionally asymmetric:
      • Nominal  (< 120)   — gentle linear decay; clean air degrades score slowly.
      • Warning  (120–249) — steeper linear decay; hazardous range costs more points.
      • Critical (≥ 250)   — steep slope; extreme pollution collapses score fast.

    Parameters
    ----------
    pm25_value : float | None
        Raw PM2.5 concentration in µg/m³. None triggers the fallback path.

    Returns
    -------
    tuple[int, str]
        (health_score ∈ [0, 100], anomaly_level ∈ {"nominal","warning","critical"})
    """

    # ── Fallback: missing / NA data ──────────────────────────────────────────
    if pm25_value is None:
        log.warning("PM2.5 value missing — returning fallback (50, nominal)")
        return (50, "nominal")

    pm25 = float(pm25_value)

    # ── Tier 3: Severe Hazard (PM2.5 ≥ 250 µg/m³) ───────────────────────────
    # Steep slope; at 400 µg/m³ score hits 0. Formula: 100 - (pm25 × 0.25)
    if pm25 >= 250:
        score = int(max(0, 100 - (pm25 * 0.25)))
        return (score, "critical")

    # ── Tier 2: Moderate Hazard (120 ≤ PM2.5 < 250 µg/m³) ──────────────────
    # Linear regression scaling from 40 down toward 14 across the range.
    # Formula: 40 - ((pm25 - 120) × 0.2)
    if pm25 >= 120:
        score = int(40 - ((pm25 - 120) * 0.2))
        return (score, "warning")

    # ── Tier 1: Nominal / Clean (PM2.5 < 120 µg/m³) ─────────────────────────
    # Gentle slope; score stays above 40 for clean-air conditions.
    # Formula: 100 - (pm25 × 0.5)
    score = int(100 - (pm25 * 0.5))
    return (score, "nominal")
