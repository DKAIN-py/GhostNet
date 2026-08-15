# domain/api_fetchers.py
import logging
from typing import Any, Dict
import httpx
import os

log = logging.getLogger("autonet.domain.fetchers")

from dotenv import load_dotenv

load_dotenv()

from global_config import WAQI_TOKEN

class AQIApiFetcher:
    """Stateless fetcher for real-world environmental APIs with local fallback."""

    @staticmethod
    async def fetch_station_telemetry(
        client: httpx.AsyncClient,
        station_id: str,
        token: str = WAQI_TOKEN
    ) -> Dict[str, Any]:
        """Fetches telemetry from WAQI / CPCB feeds."""
        url = f"https://api.waqi.info/feed/{station_id}/?token={token}"
        try:
            res = await client.get(url, timeout=5.0)
            if res.status_code == 200:
                data = res.json().get("data", {})
                iaqi = data.get("iaqi", {})
                pm25 = iaqi.get("pm25", {}).get("v")

                if pm25 is not None:

                    wind_data = iaqi.get("w", {})
                    wind_speed_ms = wind_data.get("v") if isinstance(wind_data, dict) else None
                    wind_speed_kmh = float(wind_speed_ms) * 3.6 if wind_speed_ms is not None else 5.4
                    wind_dir_deg = float(iaqi.get("wd", {}).get("v", 290.0))

                    return {
                        "pm25": float(pm25),
                        "pm10": float(iaqi.get("pm10", {}).get("v", pm25 * 1.5)),
                        "aqi": int(data.get("aqi", 200)),
                        "windSpeedKmh": wind_speed_kmh,
                        "windDirectionDeg": wind_dir_deg,
                        "visibilityMeters": 450 if float(pm25) > 200 else 2200,
                    }
        except Exception as e:
            log.warning("Live API query failed for station '%s': %s", station_id, e)

        # Fallback dictionary if API fails or rate-limits
        return AQIApiFetcher.get_synthetic_fallback()

    @staticmethod
    def get_synthetic_fallback() -> Dict[str, Any]:
        """Provides default nominal telemetry for non-anchor or offline sectors."""
        return {
            "pm25": 85.0,
            "pm10": 130.0,
            "aqi": 110,
            "windSpeedKmh": 8.0,
            "windDirectionDeg": 270.0,
            "visibilityMeters": 2500,
        }