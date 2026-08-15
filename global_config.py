from dotenv import load_dotenv
import os

load_dotenv()

POLL_INTERVAL_SEC = os.getenv("POLL_INTERVAL_SEC", None)

WAQI_TOKEN = os.getenv("WAQI_TOKEN", None)

SOCKET_URL = os.getenv("SOCKET_URL", None)

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", None)

DELHI_TRANSIT_API_KEY = os.getenv("DELHI_TRANSIT_API_KEY", None)