# config/sector_config.py
from typing import Dict, Optional
from pydantic import BaseModel, Field


class SectorConfig(BaseModel):
    sector_id: str
    name: str
    district: str
    lat: float
    lng: float
    is_live_anchor: bool = False
    radius_meters: int = 750

    # Domain Station Identifiers
    station_ids: Dict[str, str] = Field(default_factory=dict)

    # Hydrology Metadata
    has_underpass: bool = False
    underpass_name: Optional[str] = None
    primary_drain_outfall: str = None  # e.g., "Najafgarh Drain", "Barapulla Drain", "Trans-Yamuna Drain"
    baseline_drain_capacity_mmhr: float = 25.0       # Max absorption rate before standing water accumulates

    # Thermal & Urban Heat Island Metadata
    is_concrete_dense: bool = False       # Commercial/industrial concrete & asphalt zones (e.g. Nehru Place, CP)
    uhi_baseline_offset_c: float = 1.2     # Microclimate temperature offset over rural baseline (°C)

    # Transit & Mobility Metadata
    primary_choke_corridor: str = None
    baseline_bus_capacity: int = 35  # Expected active buses in sector geofence