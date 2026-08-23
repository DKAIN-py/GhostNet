from datetime import datetime
import logging
import os
import re
from typing import Any, Dict, Optional
import zipfile
import numpy as np
import pandas as pd

log = logging.getLogger("autonet.domain.metro_fetcher")


class MetroFetcher:
    """Fetcher for Delhi Metro (DMRC) telemetry built on GTFS Static Data & Metro Gate Excel models."""

    _is_loaded: bool = False
    _stops_df: Optional[pd.DataFrame] = None
    _stop_times_df: Optional[pd.DataFrame] = None
    _gates_df: Optional[pd.DataFrame] = None

    @classmethod
    def initialize_data_sources(
        cls,
        gtfs_zip_path: str = "/home/kain/work/Users/Divyanshu/projects/auto_net_agents/Agents/Metero_Transit_agent/data/dmrc_static_gtfs_v1.zip",
        gates_excel_path: str = "/home/kain/work/Users/Divyanshu/projects/auto_net_agents/Agents/Metero_Transit_agent/data/dmrc_station_and_gate_locations.xlsx",
    ) -> None:
        """Loads GTFS text files and Gate Excel into memory once at startup."""
        if cls._is_loaded:
            return

        try:
            # 1. Load GTFS CSVs from ZIP archive
            if os.path.exists(gtfs_zip_path):
                with zipfile.ZipFile(gtfs_zip_path, "r") as z:
                    cls._stops_df = pd.read_csv(z.open("stops.txt"))
                    cls._stop_times_df = pd.read_csv(z.open("stop_times.txt"))
                log.info("Loaded DMRC GTFS archive into MetroFetcher.")
            else:
                log.warning("GTFS ZIP file not found at: %s", gtfs_zip_path)

            # 2. Load Metro Gate Excel Data
            if os.path.exists(gates_excel_path):
                cls._gates_df = pd.read_excel(gates_excel_path)
                log.info("Loaded Metro Gate Excel into MetroFetcher.")
            else:
                log.warning("Metro Gate Excel not found at: %s", gates_excel_path)

            cls._is_loaded = True

        except Exception as exc:
            log.error("Failed to initialize MetroFetcher data sources: %s", exc)

    @classmethod
    async def fetch_station_telemetry(
        cls,
        sector_id: str,
    ) -> Dict[str, Any]:
        """Calculates real-time station metrics using static GTFS frequency + gate maps.

        Returns strictly: passengerInflowPerMin, activeGateCount, lineTransferSurge
        """
        if not cls._is_loaded:
            cls.initialize_data_sources()

        SECTOR_STATION_MAP = {
            "DEL_NORTH_KGATE": "Kashmere Gate",
            "DEL_CENTRAL_CHOWK": "Rajiv Chowk",
            "DEL_CENTRAL_DGATE": "Delhi Gate",
            "DEL_SOUTH_AIIMS": "Aiims",
            "DEL_WEST_DWARKA": "Dwarka",
        }

        station_name = SECTOR_STATION_MAP.get(sector_id, "Kashmere Gate")

        # -------------------------------------------------------------
        # 1. activeGateCount (from Gate Excel)
        # -------------------------------------------------------------
        active_gates = 8  # Fallback baseline
        is_interchange = False

        if cls._gates_df is not None and not cls._gates_df.empty:
            matching_gates = cls._gates_df[
                cls._gates_df["Name"]
                .astype(str)
                .str.contains(station_name, case=False, na=False)
            ]
            if not matching_gates.empty:
                active_gates = len(matching_gates)
                is_interchange = "Y" in matching_gates["Interchange (Y/N)"].values

        # -------------------------------------------------------------
        # 2. passengerInflowPerMin (from GTFS frequency + time curve)
        # -------------------------------------------------------------
        trains_per_hour = 12  # Baseline (5-min headway)
        if cls._stops_df is not None and cls._stop_times_df is not None:
            matched_stops = cls._stops_df[
                cls._stops_df["stop_name"]
                .astype(str)
                .str.contains(station_name, case=False, na=False)
            ]

            if not matched_stops.empty:
                stop_ids = matched_stops["stop_id"].unique()
                matched_times = cls._stop_times_df[
                    cls._stop_times_df["stop_id"].isin(stop_ids)
                ]
                total_trips = len(matched_times)
                if total_trips > 0:
                    trains_per_hour = max(6, int(total_trips / 18))

        now = datetime.now()
        current_hour = now.hour + (now.minute / 60.0)

        # Peak Rush Hours Multiplier (8:00–10:30 & 17:00–20:00)
        is_morning_peak = 8.0 <= current_hour <= 10.5
        is_evening_peak = 17.0 <= current_hour <= 20.0

        if is_morning_peak or is_evening_peak:
            peak_multiplier = 2.8
        elif 11.0 <= current_hour <= 16.0:
            peak_multiplier = 1.4
        else:
            peak_multiplier = 0.5

        base_passenger_load = (trains_per_hour * 180) / 60.0
        calculated_inflow = int(
            base_passenger_load * peak_multiplier * (1.8 if is_interchange else 1.0)
        )

        np.random.seed(int(now.timestamp()) % 1000)
        jitter = int(np.random.normal(0, 45))
        inflow_per_min = max(80, calculated_inflow + jitter)

        # -------------------------------------------------------------
        # 3. lineTransferSurge (Context string)
        # -------------------------------------------------------------
        if is_interchange and (is_morning_peak or is_evening_peak):
            if "Kashmere" in station_name:
                transfer_surge = "Yellow -> Red Line platform bottleneck"
            elif "Rajiv" in station_name:
                transfer_surge = "Blue -> Yellow Line interchange overflow"
            else:
                transfer_surge = "High-Density Platform Interchange Surge"
        else:
            transfer_surge = "Nominal Inter-Line Passenger Flow"

        # -------------------------------------------------------------
        # Strictly return only your 3 required fields
        # -------------------------------------------------------------
        return {
            "passengerInflowPerMin": inflow_per_min,
            "activeGateCount": active_gates,
            "lineTransferSurge": transfer_surge,
        }