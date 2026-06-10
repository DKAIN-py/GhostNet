import os
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — CORE CONFIGURATION CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Source: India Open Government Data platform — CPCB real-time AQI feed
OGD_API_URL: str = os.getenv("OGD_API_URL")

# Replace with your actual key from https://data.gov.in/user/register
OGD_API_KEY: str = os.getenv("OGD_API_KEY")

# AutoNet Node.js ingest endpoint
NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL")

# Monitoring stations — PRIMARY is preferred; BACKUP fires if PRIMARY returns NA
PRIMARY_STATION: str = "Anand Vihar, Delhi - DPCC"
BACKUP_STATION: str  = "R K Puram, Delhi - DPCC"

# How often (in seconds) the agent polls the OGD API
POLL_INTERVAL_SECONDS: int = 60

# OGD API query parameters — Delhi-wide, high record limit to capture all stations
OGD_QUERY_PARAMS: dict = {
    "api-key"        : OGD_API_KEY,
    "format"         : "json",
    "filters[city]"  : "Delhi",
    "limit"          : 300,
}

WAQI_API_URL = os.getenv("WAQI_API_URL")
WAQI_API_TOKEN = os.getenv("WAQI_API_TOKEN")

WAQI_API: str = f"{WAQI_API_URL}{WAQI_API_TOKEN}"