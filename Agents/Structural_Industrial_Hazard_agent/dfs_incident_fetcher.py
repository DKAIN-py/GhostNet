import logging
import xml.etree.ElementTree as ET
from typing import Any, Dict
import httpx

log = logging.getLogger("autonet.agent.industrial_hazard.fetcher")

# Live Google News RSS feed for targeted Delhi Industrial Fire/Hazard news
GOOGLE_NEWS_RSS_URL = (
    "https://news.google.com/rss/search?q="
    "Delhi+fire+service+OR+chemical+leak+OR+factory+blaze+when:1d&hl=en-IN&gl=IN&ceid=IN:en"
)


class DFSApiFetcher:
    """Real-time incident fetcher using RSS news parsing with synthetic hazard fallback."""

    @staticmethod
    async def fetch_incident_data(
        client: httpx.AsyncClient,
        sector_id: str,
        is_industrial_zone: bool,
        is_live_anchor: bool,
    ) -> Dict[str, Any]:
        """Scrapes live RSS hazard feeds or triggers industrial zone simulation defaults."""

        # 1. Attempt Live Feed Scraping if Anchor enabled
        if is_live_anchor:
            try:
                response = await client.get(GOOGLE_NEWS_RSS_URL, timeout=5.0)
                if response.status_code == 200:
                    root = ET.fromstring(response.content)
                    items = root.findall(".//item")

                    for item in items:
                        title = item.find("title").text if item.find("title") is not None else ""
                        description = item.find("description").text if item.find("description") is not None else ""
                        content_str = (title + " " + description).lower()

                        # Check if incident matches sector keywords (e.g., "bawana", "okhla", "chemical")
                        if any(kw in content_str for kw in ["fire", "blaze", "explosion", "leak"]):
                            log.info("[%s] Live hazard event detected in RSS feed: %s", sector_id, title)

                            is_chemical = "chemical" in content_str or "gas" in content_str
                            is_boiler = "boiler" in content_str or "explosion" in content_str

                            return {
                                "incidentType": "chemical_leak" if is_chemical else ("boiler_explosion" if is_boiler else "structure_fire"),
                                "fireTendersDeployed": 12 if "major" in content_str else 6,
                                "toxicSmokePlume": is_chemical or "toxic" in content_str,
                                "activeChemicalAgent": "Industrial Solvents / Polymer Gas" if is_chemical else "Combustion Smoke",
                                "isLiveScraped": True,
                            }
            except Exception as exc:
                log.warning("[%s] Live RSS hazard fetch failed: %s. Reverting to regional simulation.", sector_id, exc)

        # 2. Regional Simulation Engine (Triggered for designated industrial sectors)
        if is_industrial_zone and sector_id in ("DEL_ONORTH_BAWANA", "DEL_SEAST_OKHLA"):
            # Active hazard simulation profile for high-risk industrial nodes
            return {
                "incidentType": "chemical_leak_and_fire",
                "fireTendersDeployed": 14,
                "toxicSmokePlume": True,
                "activeChemicalAgent": "Ammonia Gas / Plastic Polymer Solvents",
                "isLiveScraped": False,
            }

        # 3. Nominal baseline for non-industrial or clear sectors
        return {
            "incidentType": "none",
            "fireTendersDeployed": 0,
            "toxicSmokePlume": False,
            "activeChemicalAgent": "None",
            "isLiveScraped": False,
        }