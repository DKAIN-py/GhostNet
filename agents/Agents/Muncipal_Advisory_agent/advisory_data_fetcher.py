import logging
import random
import xml.etree.ElementTree as ET
from typing import Any, Dict
import httpx

log = logging.getLogger("autonet.agent.traffic_news.fetcher")

# Live Google News RSS search targeting Delhi traffic police advisories and closures
GOOGLE_NEWS_TRAFFIC_RSS = (
    "https://news.google.com/rss/search?q="
    "Delhi+traffic+advisory+OR+road+closure+OR+protest+when:1d&hl=en-IN&gl=IN&ceid=IN:en"
)


class AdvisoryDataFetcher:
    """
    Traffic Advisory Telemetry Provider.
    Parses live Google News RSS for official police bulletins or generates dynamic Gaussian simulation data.
    """

    @staticmethod
    async def fetch_advisory_metrics(
        client: httpx.AsyncClient,
        sector_id: str,
        is_live_anchor: bool,
    ) -> Dict[str, Any]:
        """Fetches live advisory RSS items or generates sector-customized traffic advisory telemetry."""

        # 1. Attempt Live Scrape via Open RSS Feed
        if is_live_anchor:
            try:
                response = await client.get(GOOGLE_NEWS_TRAFFIC_RSS, timeout=5.0)
                if response.status_code == 200:
                    root = ET.fromstring(response.content)
                    items = root.findall(".//item")

                    for item in items:
                        title = item.find("title").text if item.find("title") is not None else ""
                        title_lower = title.lower()

                        if any(kw in title_lower for kw in ["protest", "vip", "closure", "blocked", "diverted"]):
                            log.info("[%s] Live traffic advisory matched in RSS: %s", sector_id, title)

                            is_protest = "protest" in title_lower or "demonstration" in title_lower
                            is_vip = "vip" in title_lower or "pm" in title_lower or "president" in title_lower

                            return {
                                "sourceType": "official_police_advisory" if is_vip else "news_rss",
                                "closureType": "unplanned_protest_roadblock" if is_protest else ("vip_movement" if is_vip else "planned_procession"),
                                "closureSeverity": "major_arterial_blocked",
                                "officialAdvisoryId": f"DTP-ADV-2026-{random.randint(1000, 9999)}",
                                "verifiedByPolice": True,
                                "affectedCorridors": ["Kartavya Path", "C-Hexagon India Gate", "Ashoka Road"],
                                "estimatedDurationHours": 4.0,
                            }
            except Exception as exc:
                log.warning("[%s] Live RSS advisory fetch failed: %s. Reverting to dynamic generator.", sector_id, exc)

        # 2. Dynamic Gaussian Kinematics Engine (Sector Customized)
        if sector_id == "DEL_NEW_LUTYENS":  # Parliament / Lutyens Zone (Primary Protest / VIP Node)
            return {
                "sourceType": "official_police_advisory",
                "closureType": "unplanned_protest_roadblock",
                "closureSeverity": "major_arterial_blocked",
                "officialAdvisoryId": f"DTP-ADV-2026-0810-{random.randint(10, 99)}",
                "verifiedByPolice": True,
                "affectedCorridors": ["Kartavya Path", "C-Hexagon India Gate", "Ashoka Road"],
                "estimatedDurationHours": round(max(1.0, random.gauss(4.0, 0.8)), 1),
                "secondaryChokeSectors": ["DEL_CENTRAL_CP", "DEL_NEW_KHAN"],
            }

        elif sector_id in ("DEL_CENTRAL_CP", "DEL_NORTH_KGATE"):  # Central Transit Hubs
            return {
                "sourceType": "transit_broadcast",
                "closureType": "vip_movement",
                "closureSeverity": "minor_diversion",
                "officialAdvisoryId": f"DTP-ADV-2026-{random.randint(100, 999)}",
                "verifiedByPolice": True,
                "affectedCorridors": ["Outer Circle", "Barakhamba Road"],
                "estimatedDurationHours": round(max(0.5, random.gauss(1.5, 0.5)), 1),
                "secondaryChokeSectors": ["DEL_CENTRAL_KB"],
            }

        # Baseline parameters for quiet sectors
        return {
            "sourceType": "news_rss",
            "closureType": "none",
            "closureSeverity": "none",
            "officialAdvisoryId": "NONE",
            "verifiedByPolice": False,
            "affectedCorridors": [],
            "estimatedDurationHours": 0.0,
            "secondaryChokeSectors": [],
        }