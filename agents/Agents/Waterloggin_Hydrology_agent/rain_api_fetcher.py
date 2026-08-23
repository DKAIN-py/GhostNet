# domain/rain_api_fetcher.py
import logging
from typing import Dict, Any
import httpx

log = logging.getLogger("autonet.domain.rain_fetcher")


class RainApiFetcher:
    """Stateless fetcher for real-time precipitation rates via Open-Meteo."""

    @staticmethod
    async def fetch_precipitation(
        client: httpx.AsyncClient,
        lat: float,
        lng: float
    ) -> Dict[str, float]:
        """
        Fetches current precipitation rate (mm/hr) and estimated 24h accumulation (mm).
        """
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=precipitation,rain"
            f"&hourly=precipitation&forecast_days=1"
        )
        try:
            res = await client.get(url, timeout=4.0)
            if res.status_code == 200:
                data = res.json()
                current = data.get("current", {})
                rain_rate = float(current.get("precipitation", 0.0))

                hourly = data.get("hourly", {}).get("precipitation", [])
                accumulated_24h = float(sum(hourly[:24])) if hourly else rain_rate * 3.0

                return {
                    "rainfallRateMmHr": rain_rate,
                    "accumulatedRain24hMm": round(accumulated_24h, 1)
                }
        except Exception as e:
            log.warning("Open-Meteo rain fetch failed for coordinates (%f, %f): %s", lat, lng, e)

        # Baseline default fallback (Dry conditions)
        return {
            "rainfallRateMmHr": 0.0,
            "accumulatedRain24hMm": 0.0
        }