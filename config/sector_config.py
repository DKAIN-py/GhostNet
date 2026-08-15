from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class SectorConfig(BaseModel):
    """
    Unified Sector Configuration Schema.
    Contains spatial, environmental, infrastructure, and civic metadata
    required across all 12 AutoNet monitoring agents.
    """

    # Core Spatial Metadata
    sector_id: str
    name: str
    district: str
    lat: float
    lng: float
    is_live_anchor: bool = False
    radius_meters: int = 750

    # Domain Hardware / API Station Mapping
    station_ids: Dict[str, str] = Field(
        default_factory=dict,
        description="Maps domain types to station IDs, e.g. {'cpcb': 'site_142', 'wrd': 'stn_09'}",
    )

    # -------------------------------------------------------------------------
    # DOMAIN 1: ENVIRONMENTAL AGENTS (Agents 1 - 4)
    # -------------------------------------------------------------------------

    # Agent 1: Air Quality (air_quality)
    primary_cpcb_station_id: Optional[str] = None
    historical_pm25_baseline: float = 65.0

    # Agent 2: Microclimate & Urban Heat Island (microclimate)
    is_concrete_dense: bool = False       # Dense commercial/industrial concrete zones
    uhi_baseline_offset_c: float = 1.2     # UHI temperature offset over baseline (°C)

    # Agent 3: Hydrology & Flooding (hydrology)
    has_underpass: bool = False
    underpass_name: Optional[str] = None
    primary_drain_outfall: Optional[str] = None  # e.g., "Najafgarh Drain", "Barapulla Drain", "Trans-Yamuna Drain"
    baseline_drain_capacity_mmhr: float = 25.0   # Max absorption rate before standing water accumulates

    # Agent 4: Vision Hazard / Camera Sentinel (vision_hazard)
    monitored_camera_id: Optional[str] = None
    camera_rtsp_stream_url: Optional[str] = None

    # -------------------------------------------------------------------------
    # DOMAIN 2: INFRASTRUCTURE AGENTS (Agents 5 - 9)
    # -------------------------------------------------------------------------

    # Agent 5: Arterial Flow / Traffic Kinematics (arterial_flow)
    primary_corridor_name: Optional[str] = None
    free_flow_speed_kmh: float = 55.0
    upstream_sector_id: Optional[str] = None
    recommended_bypass_route: Optional[str] = None

    # Agent 6: Public Transit Saturation (public_transit)
    primary_choke_corridor: Optional[str] = None
    baseline_bus_capacity: int = 35  # Expected active buses in sector geofence

    # Agent 7: Power Grid Autonomy (power_grid)
    discom_provider: Optional[str] = None  # e.g., "BRPL", "BYPL", "TPDDL", "NDMC"
    rated_substation_capacity_mw: float = 200.0

    # Agent 8: Industrial Hazard & Chemical Plume (industrial_hazard)
    is_industrial_zone: bool = False
    industrial_zone_type: Optional[str] = None  # e.g., "chemical_processing", "manufacturing", "none"
    hazard_facility_name: Optional[str] = None

    # Agent 9: ICU & Healthcare Capacity (hospital_capacity)
    has_major_hospital: bool = False
    primary_hospital_name: Optional[str] = None
    baseline_icu_beds: int = 100

    # -------------------------------------------------------------------------
    # DOMAIN 3: CIVIC AGENTS (Agents 10 - 12)
    # -------------------------------------------------------------------------

    # Agent 10: Emergency Dispatch 112 (emergency_dispatch)
    baseline_112_calls_per_min: int = 6
    primary_emergency_corridor: Optional[str] = None

    # Agent 11: Public Panic NLP (social_panic)
    adjacent_spillover_sectors: List[str] = Field(
        default_factory=list,
        description="Downstream/adjacent sector IDs receiving panic propagation",
    )

    # Agent 12: Municipal Advisory & News (traffic_news)
    primary_advisory_corridors: List[str] = Field(
        default_factory=list,
        description="Key arterial corridors subject to protest/VIP road closures",
    )