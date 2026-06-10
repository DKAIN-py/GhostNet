import logging

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("AutoNet.air_quality")


def calculate_health_score(pm25_value: float | None) -> tuple[int, str]:
    if pm25_value is None:
        log.warning("PM2.5 value missing — returning fallback (50, nominal)")
        return (50, "nominal")

    pm25 = float(pm25_value)

    if pm25 >= 250:
        score = int(max(0, 100 - (pm25 * 0.25)))
        return (score, "critical")

    if pm25 >= 120:
        score = int(40 - ((pm25 - 120) * 0.2))
        return (score, "warning")

    score = int(100 - (pm25 * 0.5))
    return (score, "nominal")
