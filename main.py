"""
AutoNet — Air Quality Agent
==============================
Autonomous FastAPI microservice that continuously polls India's OGD API
for Delhi PM2.5 data, normalizes it into a health score, and streams
structured signals to the Node.js AutoNet backend.

Author  : AutoNet Systems Team
Runtime : Python 3.11+ | FastAPI | httpx | asyncio
"""

import asyncio
import logging
from datetime import datetime, timezone

import httpx
# import uvicorn
from fastapi import FastAPI
from dotenv import load_dotenv
import os

load_dotenv()
# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — CORE CONFIGURATION CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Source: India Open Government Data platform — CPCB real-time AQI feed
OGD_API_URL: str = os.getenv("OGD_API_URL")

# Replace with your actual key from https://data.gov.in/user/register
OGD_API_KEY: str = os.getenv("OGD_API_KEY")

# AutoNet Node.js ingest endpoint
NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL")

# Monitoring stations — PRIMARY is preferred; BACKUP fires if PRIMARY returns NA
PRIMARY_STATION: str = "Anand Vihar, Delhi - DPCC"
BACKUP_STATION: str  = "R K Puram, Delhi - DPCC"

# How often (in seconds) the agent polls the OGD API
POLL_INTERVAL_SECONDS: int = 60

# OGD API query parameters — Delhi-wide, high record limit to capture all stations
OGD_QUERY_PARAMS: dict = {
    "api-key"        : OGD_API_KEY,
    "format"         : "json",
    "filters[city]"  : "Delhi",
    "limit"          : 300,
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — LOGGING SETUP
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — DATA EXTRACTION & BACKUP STATION LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def _parse_pm25_from_records(records: list[dict], station_name: str) -> float | None:
    """
    Searches the OGD records array for a given station's PM2.5 avg_value.

    Safely coerces the "avg_value" string field to float, rejecting:
      • "NA" strings
      • Empty strings
      • None / missing keys
      • Any non-numeric garbage the API occasionally returns

    Parameters
    ----------
    records     : list of raw record dicts from the OGD API response
    station_name: exact station string to match against "station" field

    Returns
    -------
    float | None — parsed PM2.5 value, or None if unavailable / invalid
    """
    for record in records:
        # Match station name and pollutant type (case-insensitive strip)
        station_match   = record.get("station", "").strip() == station_name.strip()
        pollutant_match = record.get("pollutant_id", "").strip().upper() == "PM2.5"

        if not (station_match and pollutant_match):
            continue

        raw_value = record.get("avg_value", "NA")

        # Guard: treat "NA", empty strings, and None as missing
        if raw_value is None or str(raw_value).strip().upper() in ("NA", ""):
            log.debug("Station '%s' returned non-numeric avg_value: %r", station_name, raw_value)
            return None

        # Safe float cast — reject anything that still won't parse
        try:
            return float(str(raw_value).strip())
        except (ValueError, TypeError):
            log.warning(
                "Station '%s' avg_value could not be cast to float: %r",
                station_name, raw_value
            )
            return None

    # Station not found in this record set at all
    log.debug("Station '%s' not found in records batch.", station_name)
    return None


async def fetch_delhi_pm25(client: httpx.AsyncClient) -> tuple[float | None, str]:
    """
    Queries the OGD API and extracts a PM2.5 reading, attempting PRIMARY
    station first and transparently falling back to BACKUP if needed.

    Returns
    -------
    tuple[float | None, str]
        (pm25_value, reporting_station_name)
        pm25_value is None only if BOTH stations are unavailable.
    """
    log.info("Querying OGD API for Delhi air quality data...")

    response = await client.get(
        OGD_API_URL,
        params  = OGD_QUERY_PARAMS,
        timeout = 300.0,  # hard timeout; OGD API can be slow
    )
    response.raise_for_status()

    payload = response.json()
    records: list[dict] = payload.get("records", [])

    if not records:
        log.error("OGD API returned empty records array — possible API key or rate-limit issue.")
        return (None, PRIMARY_STATION)

    log.info("Received %d records from OGD API.", len(records))

    # ── PRIMARY station attempt ──────────────────────────────────────────────
    pm25 = _parse_pm25_from_records(records, PRIMARY_STATION)
    if pm25 is not None:
        log.info("PRIMARY station '%s' → PM2.5 = %.1f µg/m³", PRIMARY_STATION, pm25)
        return (pm25, PRIMARY_STATION)

    # ── BACKUP station fallback ──────────────────────────────────────────────
    log.warning(
        "PRIMARY station '%s' unavailable or returned NA — activating BACKUP station.",
        PRIMARY_STATION
    )
    pm25 = _parse_pm25_from_records(records, BACKUP_STATION)
    if pm25 is not None:
        log.info("BACKUP station '%s' → PM2.5 = %.1f µg/m³", BACKUP_STATION, pm25)
        return (pm25, BACKUP_STATION)

    # ── Both stations dead ───────────────────────────────────────────────────
    log.error(
        "Both PRIMARY ('%s') and BACKUP ('%s') stations returned no valid PM2.5 data.",
        PRIMARY_STATION, BACKUP_STATION
    )
    return (None, PRIMARY_STATION)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — PAYLOAD BUILDER (SCHEMA CONTRACT)
# ─────────────────────────────────────────────────────────────────────────────

def build_signal_payload(
    pm25_value   : float | None,
    station_name : str,
    health_score : int,
    anomaly_level: str,
) -> dict:
    """
    Constructs the exact JSON payload shape required by the AutoNet
    Node.js backend. Key names and casing are locked — do not modify.

    Schema
    ------
    {
      "agentId"     : "air_quality",
      "domain"      : "air",
      "healthScore" : <int>,
      "anomalyLevel": <"critical"|"warning"|"nominal">,
      "signal"      : "<station> reporting PM2.5 at <value> µg/m³",
      "timestamp"   : "<ISO-8601 Zulu string>"
    }
    """
    # Format PM2.5 value for the signal string; show "N/A" if missing
    pm25_display = f"{pm25_value:.1f}" if pm25_value is not None else "N/A"

    return {
        "agentId"     : "air_quality",
        "domain"      : "air",
        "healthScore" : health_score,
        "anomalyLevel": anomaly_level,
        "signal"      : f"{station_name} reporting PM2.5 at {pm25_display} µg/m³",
        "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — CORE AGENT LOOP (BACKGROUND WORKER)
# ─────────────────────────────────────────────────────────────────────────────

async def air_quality_agent_loop() -> None:
    """
    Continuous non-blocking background worker.

    Every POLL_INTERVAL_SECONDS:
      1. Fetches Delhi PM2.5 from OGD API (with backup fallback)
      2. Normalizes raw value into health score + anomaly level
      3. Builds schema-compliant payload
      4. POSTs payload to Node.js AutoNet backend
      5. Logs result; sleeps until next cycle

    The entire body is wrapped in a broad try/except so transient
    network errors (timeouts, DNS failures, backend downtime) never
    crash the agent process — it logs and retries on the next tick.
    """
    log.info("Air Quality Agent loop starting. Poll interval: %ds", POLL_INTERVAL_SECONDS)

    # Single shared async HTTP client — connection pooling, keep-alive
    async with httpx.AsyncClient() as client:
        while True:
            try:
                # ── Step 1: Fetch ────────────────────────────────────────────
                pm25_value, station_name = await fetch_delhi_pm25(client)

                # ── Step 2: Normalize ────────────────────────────────────────
                health_score, anomaly_level = calculate_health_score(pm25_value)

                # ── Step 3: Build payload ────────────────────────────────────
                payload = build_signal_payload(
                    pm25_value   = pm25_value,
                    station_name = station_name,
                    health_score = health_score,
                    anomaly_level= anomaly_level,
                )

                log.info(
                    "Signal built → healthScore=%d | anomalyLevel=%s | station=%s | PM2.5=%s",
                    health_score,
                    anomaly_level.upper(),
                    station_name,
                    f"{pm25_value:.1f} µg/m³" if pm25_value else "N/A",
                )

                # ── Step 4: POST to Node.js backend ──────────────────────────
                response = await client.post(
                    NODE_BACKEND_URL,
                    json   = payload,
                    timeout= 10.0,
                )
                response.raise_for_status()

                log.info(
                    "Signal dispatched to backend → HTTP %d | timestamp=%s",
                    response.status_code,
                    payload["timestamp"],
                )

            # ── Resilience: OGD API failures ─────────────────────────────────
            except httpx.TimeoutException as exc:
                log.error("OGD API request timed out: %s — will retry in %ds", exc, POLL_INTERVAL_SECONDS)

            except httpx.HTTPStatusError as exc:
                log.error(
                    "HTTP error from %s → status %d — will retry in %ds",
                    exc.request.url, exc.response.status_code, POLL_INTERVAL_SECONDS
                )

            except httpx.RequestError as exc:
                log.error("Network error during request to %s: %s", exc.request.url, exc)

            # ── Resilience: Backend POST failures ────────────────────────────
            except Exception as exc:
                # Broad catch — agent must NEVER crash regardless of error type
                log.exception("Unexpected error in agent loop: %s", exc)

            # ── Wait for next poll cycle (non-blocking) ───────────────────────
            log.debug("Sleeping %ds until next poll cycle...", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — FASTAPI APPLICATION & LIFECYCLE
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title      = "AutoNet — Air Quality Agent",
    description= "Autonomous PM2.5 monitoring microservice for Delhi. Part of the AutoNet AQI pipeline.",
    version    = "1.0.0",
)


@app.on_event("startup")
async def startup_event() -> None:
    """
    FastAPI startup hook — launches the background agent loop as a
    non-blocking asyncio Task so it runs concurrently with the HTTP
    server without blocking any incoming requests.
    """
    log.info("AutoNet Air Quality Agent starting up...")
    asyncio.create_task(air_quality_agent_loop())
    log.info("Background agent loop scheduled via asyncio.create_task().")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — HTTP ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/status",
    summary    = "Agent health check",
    tags       = ["Health"],
    response_description="Confirms the agent process is alive and the loop is running.",
)
async def status() -> dict:
    """
    Lightweight liveness probe endpoint.
    Returns immediately — does not query the OGD API.
    Use for Docker health checks, load balancer probes, or manual verification.
    """
    return {
        "agent" : "air_quality",
        "status": "running",
    }


@app.get(
    "/score-preview",
    summary = "Dry-run the normalization engine",
    tags    = ["Debug"],
)
async def score_preview(pm25: float) -> dict:
    """
    Debug endpoint — pass any PM2.5 value as a query param and get back
    the health score + anomaly level without hitting the live API.

    Example: GET /score-preview?pm25=185
    """
    health_score, anomaly_level = calculate_health_score(pm25)
    return {
        "input_pm25"   : pm25,
        "health_score" : health_score,
        "anomaly_level": anomaly_level,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 9 — ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

# if __name__ == "__main__":
#     uvicorn.run(
#         "air_quality_agent:app",
#         host      = "0.0.0.0",
#         port      = 8001,          # each AutoNet agent runs on its own port
#         reload    = False,         # disable in production
#         log_level = "info",
#     )