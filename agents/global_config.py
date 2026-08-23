from dotenv import load_dotenv
import os

load_dotenv()


def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


POLL_INTERVAL_SEC = _get_int_env("POLL_INTERVAL_SEC", 30)

WAQI_TOKEN = os.getenv("WAQI_TOKEN", None)

SOCKET_URL = os.getenv("SOCKET_URL", None)

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", None)

DELHI_TRANSIT_API_KEY = os.getenv("DELHI_TRANSIT_API_KEY", None)