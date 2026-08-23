# domain/thermal_model.py
from typing import Tuple, Dict, Any


class ThermalModel:
    """
    Pure domain physics for urban microclimates, Urban Heat Island (UHI) effects,
    feels-like heat index, power grid load surge, and transformer trip risks.
    """

    @staticmethod
    def calculate_feels_like_c(temp_c: float, humidity_pct: float) -> float:
        """
        Calculates apparent temperature (°C) accounting for humidity (Rothfusz Heat Index).
        """
        if temp_c < 27.0:
            return round(temp_c, 1)

        # Formula uses temperature in Fahrenheit
        T = (temp_c * 9.0 / 5.0) + 32.0
        RH = humidity_pct

        hi_f = (
            -42.379
            + (2.04901523 * T)
            + (10.14333127 * RH)
            - (0.22475541 * T * RH)
            - (0.00683783 * T * T)
            - (0.05481717 * RH * RH)
            + (0.00122874 * T * T * RH)
            + (0.00085282 * T * RH * RH)
            - (0.00000199 * T * T * RH * RH)
        )

        feels_like_c = (hi_f - 32.0) * 5.0 / 9.0
        return round(max(temp_c, feels_like_c), 1)

    @staticmethod
    def calculate_surface_temp_c(
        ambient_temp_c: float,
        solar_irradiance_wm2: float,
        is_concrete_dense: bool
    ) -> float:
        """
        Estimates asphalt/rooftop surface thermal radiation temperature (°C).
        Concrete and asphalt absorb solar radiation heavily during daylight hours.
        """
        concrete_factor = 1.4 if is_concrete_dense else 1.0
        solar_heating = (solar_irradiance_wm2 / 1000.0) * 14.5 * concrete_factor
        return round(ambient_temp_c + solar_heating, 1)

    @staticmethod
    def calculate_uhi_delta_c(
        ambient_temp_c: float,
        uhi_baseline_offset_c: float,
        is_concrete_dense: bool
    ) -> float:
        """Calculates Urban Heat Island temperature elevation over rural baseline (°C)."""
        density_multiplier = 1.8 if is_concrete_dense else 1.0
        delta = uhi_baseline_offset_c * density_multiplier
        return round(delta, 1)

    @staticmethod
    def calculate_grid_load_impact(feels_like_c: float) -> float:
        """Projects percentage jump in local power grid demand from AC cooling loads."""
        if feels_like_c <= 35.0:
            return 0.0
        surge = (feels_like_c - 35.0) * 2.85
        return round(min(65.0, surge), 1)

    @staticmethod
    def classify_transformer_trip_risk(feels_like_c: float, surface_temp_c: float) -> str:
        """Classifies localized distribution transformer overheating risk."""
        if feels_like_c >= 48.0 or surface_temp_c >= 56.0:
            return "EXTREME"
        if feels_like_c >= 44.0 or surface_temp_c >= 50.0:
            return "HIGH"
        if feels_like_c >= 39.0:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def classify_heatstroke_risk(feels_like_c: float) -> str:
        """Classifies human physiological heat stress hazard."""
        if feels_like_c >= 46.0:
            return "SEVERE"
        if feels_like_c >= 40.0:
            return "HIGH"
        return "MODERATE"

    @staticmethod
    def calculate_health_score(feels_like_c: float, transformer_risk: str) -> Tuple[int, str]:
        """Calculates normalized Health Score [0 = Critical, 100 = Optimal]."""
        if feels_like_c < 38.0:
            score = 90
        elif feels_like_c < 42.0:
            score = 65
        elif feels_like_c < 46.0:
            score = 42
        elif feels_like_c < 50.0:
            score = 25
        else:
            score = 12

        if transformer_risk in ["HIGH", "EXTREME"]:
            score = min(score, 28)

        level = "nominal" if score >= 70 else "warning" if score >= 40 else "critical"
        return score, level