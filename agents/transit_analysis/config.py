from dotenv import load_dotenv
import os

load_dotenv()

POLL_INTERVAL_SECONDS: int = 60

# AutoNet Node.js ingest endpoint
NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL")

# Delhi Transit API
DT_API_URL = os.getenv("DELHI_TRANSIT_API_URL")
DT_API_KEY = os.getenv("DELHI_TRANSIT_API_KEY")

DELHI_TRANSIT_API: str = f"{DT_API_URL}{DT_API_KEY}"

STATIONARY_SPEED_THRESHOLD_MS: float = 1.4
 
# Minimum buses needed on the route
MIN_BUSES_FOR_SCORING: int = 3
 
CONGESTION_CRITICAL_THRESHOLD: float = 0.70   # ≥ 70% stationary → critical
CONGESTION_WARNING_THRESHOLD: float  = 0.40   # ≥ 40% stationary → warning
