# Package Imports
import httpx

# Module Imports
from utils import log
from config import WAQI_API

async def fetch_waqi_delhi_pm25(client: httpx.AsyncClient) -> tuple[float | None, str]:

    log.info("Querying WAQI for Delhi air quality data...")

    response = await client.get(
        WAQI_API,
        timeout=30.0
    )
    response.raise_for_status()

    payload = response.json()
    pm25_value = payload.get("data", {}).get("iaqi", {}).get("pm25", {}).get("v")

    if not pm25_value:
        log.error("WAQI returned empty value")
        return (None, "Delhi")
    
    pm25_value = float(pm25_value)

    log.info("Recived pm2.5 value")

    return (pm25_value, "Delhi")