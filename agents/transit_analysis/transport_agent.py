# Package imports
from datetime import datetime, timezone
from fastapi import FastAPI
import asyncio
import httpx

# Module imports
from .utils import log, parse_vehicle_positions, compute_fleet_congestion
from .config import (POLL_INTERVAL_SECONDS, DT_API_KEY, 
                    DT_API_URL, NODE_BACKEND_URL)


def build_signal_payload(congestion: dict) -> dict:
    pct_stationary = int(congestion["worst_ratio"] * 100)

    signal = (
        f"{congestion['stationary']}/{congestion['total']} buses stationary "
        f"across {congestion['routes_scored']} routes — "
        f"worst: Route {congestion['worst_route']} at {pct_stationary}% stopped"
    )

    return {
        "agentId"     : "transit",
        "domain"      : "transport",
        "healthScore" : congestion["health_score"],
        "anomalyLevel": congestion["anomaly_level"],
        "signal"      : signal,
        "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

DELHI_TRANSIT_API: str = f"{DT_API_URL}{DT_API_KEY}"

async def transport_agent_loop() -> None:
    log.info("Transport Agent loop starting. Poll interval: %ds", POLL_INTERVAL_SECONDS)

    print(DT_API_KEY, DT_API_URL)
    headers = {"Authorization": f"Bearer {DT_API_KEY}"}
    async with httpx.AsyncClient() as client:
        while True:
            try:
                log.info("Fetching GTFS-RT protobuf feed...")
                response = await client.get(DELHI_TRANSIT_API, timeout=15.0)
                response.raise_for_status()

                raw_bytes = response.content
                log.info("Received %d bytes from GTFS feed.", len(raw_bytes))

                vehicles = parse_vehicle_positions(raw_bytes)

                congestion = compute_fleet_congestion(vehicles)

                log.info(
                    "Congestion result → healthScore=%d | anomalyLevel=%s | "
                    "%d/%d stationary | worstRoute=%s (%.0f%%)",
                    congestion["health_score"],
                    congestion["anomaly_level"].upper(),
                    congestion["stationary"],
                    congestion["total"],
                    congestion["worst_route"],
                    congestion["worst_ratio"] * 100,
                )

                payload = build_signal_payload(congestion)

                post_response = await client.post(
                    NODE_BACKEND_URL,
                    json   = payload,
                    timeout= 10.0,
                )
                post_response.raise_for_status()

                log.info(
                    "Signal dispatched → HTTP %d | timestamp=%s",
                    post_response.status_code,
                    payload["timestamp"],
                )

            except httpx.TimeoutException:
                log.error("GTFS feed request timed out — retrying in %ds", POLL_INTERVAL_SECONDS)

            except httpx.HTTPStatusError as exc:
                log.error(
                    "HTTP %d from %s — retrying in %ds",
                    exc.response.status_code, exc.request.url, POLL_INTERVAL_SECONDS
                )

            except Exception as exc:
                log.exception("Unexpected error in transport agent loop: %s", exc)

            await asyncio.sleep(POLL_INTERVAL_SECONDS)


transport_app = FastAPI(
    title      = "GHOSTNET — Transport Agent",
    description= "Autonomous DTC bus congestion monitor. Parses GTFS-RT protobuf and emits fleet health signals.",
    version    = "1.0.0",
)


@transport_app.on_event("startup")
async def startup_transit_event() -> None:
    log.info("GHOSTNET Transport Agent starting up...")
    asyncio.create_task(transport_agent_loop())
    log.info("Background agent loop scheduled.")


@transport_app.get("/status", summary="Agent liveness check", tags=["Health"])
async def status() -> dict:
    return {"agent": "transit", "status": "running"}


@transport_app.get("/congestion-preview", summary="Dry-run congestion engine", tags=["Debug"])
async def congestion_preview() -> dict:
    headers = {"Authorization": f"Bearer {DT_API_KEY}"}
    async with httpx.AsyncClient() as client:
        response = await client.get(DELHI_TRANSIT_API, timeout=15.0)
        response.raise_for_status()
        vehicles   = parse_vehicle_positions(response.content)
        congestion = compute_fleet_congestion(vehicles)
        return congestion