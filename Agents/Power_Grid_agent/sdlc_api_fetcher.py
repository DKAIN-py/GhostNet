import logging
from typing import Any, Dict, Optional
import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("autonet.domain.sdlc_fetch")

SLDC_URL = "https://delhisldc.org/RealTimeDiscomData.aspx?Loc=0804"


class SLDCDataFetcher:
    """Fetcher and parser for Delhi State Load Despatch Center (SLDC) real-time data."""

    def __init__(self, http_client: Optional[httpx.AsyncClient] = None):
        self.client = http_client or httpx.AsyncClient(timeout=10.0)

    async def fetch_live_html(self) -> Optional[str]:
        """Fetch real-time HTML from Delhi SLDC dashboard."""
        try:
            response = await self.client.get(SLDC_URL)
            response.raise_for_status()
            return response.text
        except Exception as exc:
            log.warning("Failed to fetch live SLDC data: %s. Falling back to generator.", exc)
            return None

    def parse_sldc_html(self, html_content: str) -> Dict[str, Any]:
        """Extract grid frequency, DISCOM drawls, and substation metrics from HTML DOM."""
        soup = BeautifulSoup(html_content, "html.parser")

        parsed_data = {
            "gridFrequencyHz": 50.0,
            "totalDelhiLoadMW": 0.0,
            "discoms": {},
            "substations": {},
        }

        # 1. Extract Grid Frequency
        freq_tag = soup.find("span", id="ContentPlaceHolder3_LBLFREQUENCY")
        if freq_tag and freq_tag.text.strip():
            try:
                parsed_data["gridFrequencyHz"] = float(freq_tag.text.strip())
            except ValueError:
                pass

        # 2. Extract Total Delhi Load
        load_tag = soup.find("span", id="ContentPlaceHolder3_LblLoad")
        if load_tag and load_tag.text.strip():
            try:
                parsed_data["totalDelhiLoadMW"] = float(load_tag.text.strip())
            except ValueError:
                pass

        # 3. Parse DISCOM Drawl Table (#ContentPlaceHolder3_DDISCOM)
        discom_table = soup.find("table", id="ContentPlaceHolder3_DDISCOM")
        if discom_table:
            for row in discom_table.find_all("tr")[1:]:  # Skip header
                cols = [td.text.strip() for td in row.find_all("td")]
                if len(cols) >= 4:
                    name = cols[0]
                    try:
                        parsed_data["discoms"][name] = {
                            "schedule": float(cols[1]),
                            "drawl": float(cols[2]),
                            "od_ud": float(cols[3]),
                        }
                    except ValueError:
                        continue

        # 4. Parse Substation Grid Loadings Table (#ContentPlaceHolder3_dgrid)
        grid_table = soup.find("table", id="ContentPlaceHolder3_dgrid")
        if grid_table:
            for row in grid_table.find_all("tr")[1:]:  # Skip header
                cols = [td.text.strip() for td in row.find_all("td")]
                if len(cols) >= 5:
                    substation = cols[0]
                    try:
                        parsed_data["substations"][substation] = {
                            "rtu_status": int(cols[1]),  # 1 = Good, 0 = Suspect
                            "mw": float(cols[2]),
                            "mvar": float(cols[3]),
                            "voltage": float(cols[4]),
                        }
                    except ValueError:
                        continue

        return parsed_data