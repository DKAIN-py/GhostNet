# Package imports
from google.transit import gtfs_realtime_pb2
from collections import defaultdict
import logging

# Module imports
from .config import (STATIONARY_SPEED_THRESHOLD_MS, MIN_BUSES_FOR_SCORING,
                    CONGESTION_CRITICAL_THRESHOLD, CONGESTION_WARNING_THRESHOLD)

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("AutoNet.transit_analysis")


def parse_vehicle_positions(raw_pb_bytes: bytes) -> list[dict]:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw_pb_bytes)

    vehicles = []

    for entity in feed.entity:
        if not entity.HasField("vehicle"):
            continue

        v = entity.vehicle

        route_id = v.trip.route_id.strip()
        if not route_id:
            continue

        if not v.HasField("position"):
            continue

        vehicles.append({
            "vehicle_id": v.vehicle.id or entity.id,
            "route_id"  : route_id,
            "latitude"  : v.position.latitude,
            "longitude" : v.position.longitude,
            "speed"     : v.position.speed if v.position.HasField("speed") else 0.0,
            "timestamp" : v.timestamp,
        })

    log.info("Parsed %d valid vehicle positions from protobuf feed.", len(vehicles))
    return vehicles



def compute_fleet_congestion(vehicles: list[dict]) -> dict:
    if not vehicles:
        log.warning("No vehicles in feed — returning degraded score.")
        return {
            "health_score" : 50,
            "anomaly_level": "nominal",
            "stationary"   : 0,
            "total"        : 0,
            "worst_route"  : "N/A",
            "worst_ratio"  : 0.0,
            "routes_scored": 0,
        }

    routes: dict[str, list[dict]] = defaultdict(list)
    for v in vehicles:
        routes[v["route_id"]].append(v)

    per_route_scores = []
    worst_route      = "N/A"
    worst_ratio      = 0.0
    total_stationary = 0
    routes_scored    = 0

    for route_id, buses in routes.items():
        if len(buses) < MIN_BUSES_FOR_SCORING:
            continue  # too few buses to be statistically meaningful

        routes_scored += 1

        stationary_count = sum(
            1 for b in buses if b["speed"] <= STATIONARY_SPEED_THRESHOLD_MS
        )
        total_stationary += stationary_count

        ratio = stationary_count / len(buses)
        route_score = int(100 - (ratio * 100))
        per_route_scores.append(route_score)

        if ratio > worst_ratio:
            worst_ratio = ratio
            worst_route = route_id

        log.debug(
            "Route %s → %d/%d stationary (%.0f%%) → score %d",
            route_id, stationary_count, len(buses), ratio * 100, route_score
        )

    if per_route_scores:
        health_score = int(sum(per_route_scores) / len(per_route_scores))
    else:
        log.warning("No routes met the minimum bus threshold (%d). Returning neutral score.", MIN_BUSES_FOR_SCORING)
        health_score = 50

    if worst_ratio >= CONGESTION_CRITICAL_THRESHOLD:
        anomaly_level = "critical"
    elif worst_ratio >= CONGESTION_WARNING_THRESHOLD:
        anomaly_level = "warning"
    else:
        anomaly_level = "nominal"

    return {
        "health_score" : health_score,
        "anomaly_level": anomaly_level,
        "stationary"   : total_stationary,
        "total"        : len(vehicles),
        "worst_route"  : worst_route,
        "worst_ratio"  : round(worst_ratio, 3),
        "routes_scored": routes_scored,
    }
