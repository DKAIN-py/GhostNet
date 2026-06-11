# Package imports
from datetime import datetime, timezone
from fastapi import FastAPI
import asyncio
import httpx

# Module imports
from .gov_air_api import fetch_delhi_pm25
from .utils import log, calculate_health_score
from .aqicn_air_api import fetch_waqi_delhi_pm25
from .config import (NODE_BACKEND_URL, POLL_INTERVAL_SECONDS)


def build_signal_payload(
    pm25_value   : float | None,
    station_name : str,
    health_score : int,
    anomaly_level: str,
) -> dict:
    pm25_display = f"{pm25_value:.1f}" if pm25_value is not None else "N/A"

    return {
        "agentId"     : "air_quality",
        "domain"      : "air",
        "healthScore" : health_score,
        "anomalyLevel": anomaly_level,
        "signal"      : f"{station_name} reporting PM2.5 at {pm25_display} µg/m³",
        "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


async def get_pm25(client: httpx.AsyncClient) -> tuple[float | None, str]:
   
    pm25_val = await fetch_delhi_pm25(client)
    if pm25_val is None:
        pm25_val_tuple = await fetch_waqi_delhi_pm25(client)

    return pm25_val_tuple


async def air_quality_agent_loop() -> None:
    log.info("Air Quality Agent loop starting. Poll interval: %ds", POLL_INTERVAL_SECONDS)

    async with httpx.AsyncClient() as client:
        while True:
            try:
                pm25_value, station_name = await get_pm25(client)

                health_score, anomaly_level = calculate_health_score(pm25_value)

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

            except httpx.TimeoutException as exc:
                log.error("Both APIs requests timed out: %s — will retry in %ds", exc, POLL_INTERVAL_SECONDS)

            except httpx.HTTPStatusError as exc:
                log.error(
                    "HTTP error from %s → status %d — will retry in %ds",
                    exc.request.url, exc.response.status_code, POLL_INTERVAL_SECONDS
                )

            except httpx.RequestError as exc:
                log.error("Network error during request to %s: %s", exc.request.url, exc)

            except Exception as exc:
                log.exception("Unexpected error in agent loop: %s", exc)

            log.debug("Sleeping %ds until next poll cycle...", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)



air_app = FastAPI(
    title      = "AutoNet — Air Quality Agent",
    description= "Autonomous PM2.5 monitoring microservice for Delhi. Part of the AutoNet AQI pipeline.",
    version    = "1.0.0",
)


@air_app.on_event("startup")
async def startup_air_event() -> None:
    log.info("AutoNet Air Quality Agent starting up...")
    asyncio.create_task(air_quality_agent_loop())
    log.info("Background agent loop scheduled via asyncio.create_task().")


@air_app.get(
    "/status",
    summary    = "Agent health check",
    tags       = ["Health"],
    response_description="Confirms the agent process is alive and the loop is running.",
)
async def status() -> dict:
    return {
        "agent" : "air_quality",
        "status": "running",
    }


@air_app.get(
    "/score-preview",
    summary = "Dry-run the normalization engine",
    tags    = ["Debug"],
)
async def score_preview(pm25: float) -> dict:
    health_score, anomaly_level = calculate_health_score(pm25)
    return {
        "input_pm25"   : pm25,
        "health_score" : health_score,
        "anomaly_level": anomaly_level,
    }
