# domain/weather_api_fetcher.py
import logging
from typing import Dict, Any
import httpx

log = logging.getLogger("autonet.domain.weather_fetcher")


class WeatherApiFetcher:
    """Stateless fetcher for real-time thermal & solar telemetry via Open-Meteo."""

    @staticmethod
    async def fetch_thermal_telemetry(
        client: httpx.AsyncClient,
        lat: float,
        lng: float
    ) -> Dict[str, float]:
        """
        Fetches current air temperature, humidity, direct solar irradiance, and apparent temp.
        """
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,direct_normal_irradiance"
        )
        try:
            res = await client.get(url, timeout=4.0)
            if res.status_code == 200:
                current = res.json().get("current", {})
                return {
                    "ambientTempC": float(current.get("temperature_2m", 38.5)),
                    "relativeHumidityPct": float(current.get("relative_humidity_2m", 42.0)),
                    "feelsLikeTempC": float(current.get("apparent_temperature", 43.0)),
                    "solarIrradianceWm2": float(current.get("direct_normal_irradiance", 850.0)),
                }
        except Exception as e:
            log.warning("Open-Meteo thermal fetch failed for coordinates (%f, %f): %s", lat, lng, e)

        # Nominal summer afternoon default for Delhi
        return {
            "ambientTempC": 41.0,
            "relativeHumidityPct": 45.0,
            "feelsLikeTempC": 46.2,
            "solarIrradianceWm2": 880.0,
        }