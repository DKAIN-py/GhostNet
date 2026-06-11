# Package imports
import httpx

## Module imports
from .utils import log
from .config import (OGD_API_URL,PRIMARY_STATION, 
                    BACKUP_STATION, OGD_QUERY_PARAMS)

def _parse_pm25_from_records(records: list[dict], station_name: str) -> float | None:
    for record in records:
        station_match   = record.get("station", "").strip() == station_name.strip()
        pollutant_match = record.get("pollutant_id", "").strip().upper() == "PM2.5"

        if not (station_match and pollutant_match):
            continue

        raw_value = record.get("avg_value", "NA")

        if raw_value is None or str(raw_value).strip().upper() in ("NA", ""):
            log.debug("Station '%s' returned non-numeric avg_value: %r", station_name, raw_value)
            return None

        try:
            return float(str(raw_value).strip())
        except (ValueError, TypeError):
            log.warning(
                "Station '%s' avg_value could not be cast to float: %r",
                station_name, raw_value
            )
            return None

    log.debug("Station '%s' not found in records batch.", station_name)
    return None


async def fetch_delhi_pm25(client: httpx.AsyncClient) -> tuple[float | None, str]:
    log.info("Querying OGD API for Delhi air quality data...")
    try:
        response = await client.get(
            OGD_API_URL,
            params  = OGD_QUERY_PARAMS,
            timeout = 30.0,  
        )
        response.raise_for_status()

        payload = response.json()
        records: list[dict] = payload.get("records", [])

        if not records:
            log.error("OGD API returned empty records array — possible API key or rate-limit issue.")
            return (None, PRIMARY_STATION)

        log.info("Received %d records from OGD API.", len(records))

        pm25 = _parse_pm25_from_records(records, PRIMARY_STATION)
        if pm25 is not None:
            log.info("PRIMARY station '%s' → PM2.5 = %.1f µg/m³", PRIMARY_STATION, pm25)
            return (pm25, PRIMARY_STATION)

        log.warning(
            "PRIMARY station '%s' unavailable or returned NA — activating BACKUP station.",
            PRIMARY_STATION
        )
        pm25 = _parse_pm25_from_records(records, BACKUP_STATION)
        if pm25 is not None:
            log.info("BACKUP station '%s' → PM2.5 = %.1f µg/m³", BACKUP_STATION, pm25)
            return (pm25, BACKUP_STATION)

        log.error(
            "Both PRIMARY ('%s') and BACKUP ('%s') stations returned no valid PM2.5 data.",
            PRIMARY_STATION, BACKUP_STATION
        )
        return (None, PRIMARY_STATION)
    
    except httpx.TimeoutException as exc:
        log.error("OGD Error: %s", exc)
    except httpx.HTTPStatusError as exc:
        log.error("OGD HTTPS status Error: %s", exc)

    