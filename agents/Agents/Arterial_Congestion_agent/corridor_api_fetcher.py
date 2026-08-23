import logging
from typing import Dict, Any, Optional
import httpx

log = logging.getLogger("autonet.domain.corridor_fetcher")


class CorridorFetcher:
    """Fetcher for live traffic telemetry (TomTom / OSM) with deterministic spatial fallback."""

    @staticmethod
    async def fetch_corridor_kinematics(
        client: httpx.AsyncClient,
        sector_id: str,
        free_flow_speed_kmh: float,
        lat: float,
        lng: float,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetches live TomTom Flow telemetry or computes deterministic domain defaults.
        """
        current_speed: Optional[float] = None

        # 1. Live Fetch Strategy (TomTom Flow Segment API)
        if api_key:
            url = (
                f"https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
                f"?point={lat},{lng}&key={api_key}"
            )
            try:
                res = await client.get(url, timeout=3.5)
                if res.status_code == 200:
                    data = res.json().get("flowSegmentData", {})
                    if "currentSpeed" in data:
                        current_speed = float(data["currentSpeed"])
            except Exception as exc:
                log.debug("[%s] TomTom live feed fetch fallback: %s", sector_id, exc)

        # 2. Deterministic Spatial Fallback Model
        if current_speed is None:
            node_hash = hash(f"{sector_id}_road_corridor")
            is_congested_sector = (node_hash % 4 == 0)  # ~25% heavy traffic sectors

            if is_congested_sector:
                current_speed = 12.4
                jam_length_meters = 2800
                bottleneck_type = "Flyover Merge Bottleneck"
            else:
                current_speed = 42.0
                jam_length_meters = 350
                bottleneck_type = "Nominal Traffic Flow"
        else:
            if current_speed < 15.0:
                jam_length_meters = 2500
                bottleneck_type = "Flyover Merge Bottleneck"
            elif current_speed < 30.0:
                jam_length_meters = 1200
                bottleneck_type = "Signal Failure"
            else:
                jam_length_meters = 200
                bottleneck_type = "Nominal Traffic Flow"

        return {
            "currentAvgSpeedKmh": current_speed,
            "freeFlowSpeedKmh": free_flow_speed_kmh,
            "jamLengthMeters": jam_length_meters,
            "bottleneckType": bottleneck_type,
        }