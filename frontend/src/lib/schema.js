// ─────────────────────────────────────────────────────────
// GHOSTNET — Signal Schema v4 (39-sector AUTONET mesh)
//
// Every sector runs all 12 micro-agents, so the live mesh is
// 39 sectors x 12 agents = 468 signals. Hand-authoring that
// many is pointless, so MOCK_SIGNALS is generated:
//
//   - a HOT_SIGNALS table seeds a deliberate, spatially
//     coherent cascade cluster in East Delhi (Laxmi Nagar
//     smog -> panic -> road -> metro -> power -> hospital ->
//     emergency) plus a handful of standalone anomalies
//     elsewhere so every one of the 12 visual types has at
//     least one live example to render.
//   - every other sector/agent combination gets a nominal
//     baseline signal with small deterministic jitter, so the
//     mesh looks alive without drowning the cascade signal.
//
// Every signal object still follows the base contract:
//
// {
//   agentId, domain, sectorId, district, isLiveAnchor,
//   healthScore, anomalyLevel, signal, location, metrics,
//   <agentSpecific>Forecast, timestamp
// }
// ─────────────────────────────────────────────────────────

import { SECTORS, SECTOR_BY_ID } from "./sectors";

// ── Agent IDs ─────────────────────────────────────────────

export const AGENT_IDS = {
  SMOG_DISPERSION: "smog_dispersion",
  WATERLOGGING_HYDROLOGY: "waterlogging_hydrology",
  THERMAL_STRESS: "thermal_stress",
  TRANSIT_FLEET: "transit_fleet",
  ROAD_CORRIDOR: "road_corridor",
  METRO_TRANSIT: "metro_transit",
  POWER_GRID: "power_grid",
  INDUSTRIAL_HAZARD: "industrial_hazard",
  HOSPITAL_CAPACITY: "hospital_capacity",
  EMERGENCY_DISPATCH: "emergency_dispatch",
  SOCIAL_PANIC: "social_panic",
  TRAFFIC_NEWS: "traffic_news",
};

export const ALL_AGENT_IDS = Object.values(AGENT_IDS);


// ── Human-readable agent metadata ─────────────────────────

export const AGENT_META = {
  smog_dispersion: {
    label: "Smog & Dispersion", domain: "environment",
    primaryMetric: "PM2.5 / Wind Velocity",
    failureImpact: "Lowers road visibility; triggers health advisories",
    dataAnchor: "CPCB / DPCC Live API",
  },
  waterlogging_hydrology: {
    label: "Urban Hydrology", domain: "environment",
    primaryMetric: "Rain Depth / Drain Flow",
    failureImpact: "Floods underpasses; halts road traffic",
    dataAnchor: "IMD Weather API + PWD Drainage Alerts",
  },
  thermal_stress: {
    label: "Ambient Thermal", domain: "environment",
    primaryMetric: "Temperature Anomaly",
    failureImpact: "Overloads power grids; increases heat casualties",
    dataAnchor: "Open-Meteo / IMD Surface Feed",
  },
  transit_fleet: {
    label: "Bus Fleet Bottleneck", domain: "transit",
    primaryMetric: "GTFS Bus Moving Speed",
    failureImpact: "Signals localized public bus gridlock",
    dataAnchor: "OTD Delhi GTFS-Realtime",
  },
  road_corridor: {
    label: "Arterial Congestion", domain: "transit",
    primaryMetric: "Flyover/Corridor Delays",
    failureImpact: "Identifies highway choke points",
    dataAnchor: "TomTom Traffic Index / OSM Routing API",
  },
  metro_transit: {
    label: "Metro Transit Gate", domain: "transit",
    primaryMetric: "Station Inflow Density",
    failureImpact: "Identifies mass transit overflow",
    dataAnchor: "DMRC Passenger Flow API",
  },
  power_grid: {
    label: "Power Grid", domain: "infrastructure",
    primaryMetric: "Transformer Load %",
    failureImpact: "Causes traffic light failures & commercial blackouts",
    dataAnchor: "Discom Load Telemetry",
  },
  industrial_hazard: {
    label: "Industrial Hazard", domain: "infrastructure",
    primaryMetric: "Fire / Chemical Alerts",
    failureImpact: "Demands immediate traffic rerouting",
    dataAnchor: "Delhi Fire Service (DFS) Incident Logs",
  },
  hospital_capacity: {
    label: "ICU & Hospital Bed", domain: "infrastructure",
    primaryMetric: "Bed Occupancy Rate",
    failureImpact: "Signals medical system saturation",
    dataAnchor: "Delhi Health Portal",
  },
  emergency_dispatch: {
    label: "Emergency Dispatch", domain: "civic",
    primaryMetric: "112 Call Volume / Min",
    failureImpact: "Serves as early physical incident indicator",
    dataAnchor: "112 CAD / Dispatch Feed",
  },
  social_panic: {
    label: "Social Panic NLP", domain: "civic",
    primaryMetric: "RoBERTa Panic Score",
    failureImpact: "Measures civilian panic velocity",
    dataAnchor: "Twitter/X Scraper + RoBERTa Pipeline",
  },
  traffic_news: {
    label: "Municipal News", domain: "civic",
    primaryMetric: "Official Road Block Logs",
    failureImpact: "Tracks planned/unplanned diversions",
    dataAnchor: "Delhi Traffic Police RSS / X Feed",
  },
};


// ── Socket.io Event Names ─────────────────────────────────

export const SOCKET_EVENTS = {
  AGENT_SIGNAL: "agent-signal",
  CASCADE_ALERT: "cascade-alert",
  CASCADE_CLEAR: "cascade-clear",
  AGENT_COMMS: "agent-comms",

  // NEW — citywide aggregated incident (fires ~every 30 min),
  // distinct from the per-sector CASCADE_ALERT/CASCADE_CLEAR above.
  CITY_INCIDENT: "city-incident",
  CITY_INCIDENT_CLEAR: "city-incident-clear",
};


// ── Cascade Weights (must sum sensibly; used by the decay engine) ──

export const CASCADE_WEIGHTS = {
  smog_dispersion: 0.12,
  waterlogging_hydrology: 0.08,
  thermal_stress: 0.08,
  transit_fleet: 0.08,
  road_corridor: 0.08,
  metro_transit: 0.07,
  power_grid: 0.10,
  industrial_hazard: 0.12,
  hospital_capacity: 0.08,
  emergency_dispatch: 0.07,
  social_panic: 0.07,
  traffic_news: 0.05,
};

export const CASCADE_THRESHOLD = 0.65;


// ── Citywide incident schema constants (NEW) ────────────────
//
// Mirrors the enums in the "AutoNet Citywide Multi-Agent Cascade
// Aggregation" JSON schema. Frontend components can import these
// instead of hardcoding the allowed value lists.

export const CITY_SEVERITY_LEVELS = ["NOMINAL", "ELEVATED", "HIGH", "CRITICAL"];

// Per the schema's `rootCauseDomain` enum — deliberately a subset
// of ALL_AGENT_IDS (the schema only allows these six as a root cause).
export const CITY_ROOT_CAUSE_DOMAINS = [
  "waterlogging_hydrology",
  "smog_dispersion",
  "thermal_stress",
  "transit_fleet",
  "road_corridor",
  "power_grid",
];

export const CITY_MITIGATION_PRIORITIES = ["P1_CRITICAL", "P2_HIGH", "P3_MEDIUM"];


// ── Deterministic jitter ────────────────────────────────────
// Same sectorId+agentId always produces the same "random"
// value, so the mesh doesn't reshuffle every render but still
// looks varied sector to sector.

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function jitter(seed, min, max) {
  return min + seed * (max - min);
}


// ── Per-agent scenario tiers ────────────────────────────────
// Each agent defines nominal / warning / critical presets.
// `metrics`/`forecast` numeric leaves get jittered per-sector
// via the `j(lo, hi)` closure passed in, so 39 nominal smog
// readings don't all show the identical AQI.

const AGENT_PROFILES = {

  smog_dispersion: {
    forecastKey: "diffusionForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(70, 92)),
        signal: `AQI within acceptable range, light dispersion.`,
        metrics: {
          pm25: Math.round(j(35, 90)), pm10: Math.round(j(60, 140)),
          aqi: Math.round(j(80, 160)), windSpeedKmh: Number(j(6, 16).toFixed(1)),
          windDirectionDeg: Math.round(j(0, 359)), visibilityMeters: Math.round(j(1800, 4000)),
          stagnationIndex: Number(j(0.1, 0.35).toFixed(2)),
        },
        forecast: { targetSectorIds: [], estimatedArrivalMins: 0, projectedAqipIncrease: 0 },
      },
      warning: {
        healthScore: Math.round(j(45, 62)),
        signal: `PM2.5 climbing (${Math.round(j(160, 220))} µg/m³), wind weakening.`,
        metrics: {
          pm25: Math.round(j(160, 220)), pm10: Math.round(j(240, 310)),
          aqi: Math.round(j(210, 260)), windSpeedKmh: Number(j(4, 8).toFixed(1)),
          windDirectionDeg: Math.round(j(0, 359)), visibilityMeters: Math.round(j(900, 1400)),
          stagnationIndex: Number(j(0.5, 0.68).toFixed(2)),
        },
        forecast: { targetSectorIds: [], estimatedArrivalMins: Math.round(j(60, 90)), projectedAqipIncrease: Math.round(j(15, 25)) },
      },
      critical: {
        healthScore: 24,
        signal: "Severe PM2.5 spike (310 µg/m³) with low wind. Stagnant plume diffusing ESE towards Preet Vihar and Mayur Vihar.",
        metrics: { pm25: 310.5, pm10: 485.0, aqi: 382, windSpeedKmh: 4.2, windDirectionDeg: 290, visibilityMeters: 450, stagnationIndex: 0.88 },
        forecast: { targetSectorIds: ["DEL_EAST_PV", "DEL_EAST_MV"], estimatedArrivalMins: 45, projectedAqipIncrease: 40 },
      },
    })[level],
  },

  waterlogging_hydrology: {
    forecastKey: "floodForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(75, 96)),
        signal: "Drainage nominal, no standing water reported.",
        metrics: {
          rainfallRateMmHr: Number(j(0, 6).toFixed(1)), accumulatedRain24hMm: Number(j(0, 12).toFixed(1)),
          waterDepthCm: Number(j(0, 4).toFixed(1)), drainAbsorptionCapPct: Math.round(j(78, 98)),
          underpassFlooded: false, pumpStatus: "optimal",
        },
        forecast: { predictedDepthIn30MinsCm: 0, impassableForBuses: false, affectedCorridor: "" },
      },
      warning: {
        healthScore: Math.round(j(42, 60)),
        signal: "Moderate waterlogging forming at low-lying junction.",
        metrics: {
          rainfallRateMmHr: Number(j(24, 40).toFixed(1)), accumulatedRain24hMm: Number(j(40, 70).toFixed(1)),
          waterDepthCm: Number(j(12, 22).toFixed(1)), drainAbsorptionCapPct: Math.round(j(35, 55)),
          underpassFlooded: false, pumpStatus: "optimal",
        },
        forecast: { predictedDepthIn30MinsCm: Number(j(25, 35).toFixed(1)), impassableForBuses: false, affectedCorridor: "Local underpass" },
      },
      critical: {
        healthScore: 18,
        signal: "Severe flash waterlogging (42cm depth) at Tilak Nagar underpass. Drain capacity exhausted; road impassable.",
        metrics: { rainfallRateMmHr: 68.5, accumulatedRain24hMm: 112.0, waterDepthCm: 42.0, drainAbsorptionCapPct: 15.0, underpassFlooded: true, pumpStatus: "partially_failing" },
        forecast: { predictedDepthIn30MinsCm: 65.0, impassableForBuses: true, affectedCorridor: "Najafgarh Road Underpass / Outer Ring Junction" },
      },
    })[level],
  },

  thermal_stress: {
    forecastKey: "thermalForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(72, 94)),
        signal: "Ambient temperature within seasonal norms.",
        metrics: {
          ambientTempC: Number(j(28, 34).toFixed(1)), feelsLikeTempC: Number(j(29, 36).toFixed(1)),
          surfaceTempC: Number(j(32, 40).toFixed(1)), uhiIntensityDeltaC: Number(j(0.5, 1.8).toFixed(1)),
          humidityPct: Number(j(35, 60).toFixed(1)), solarIrradianceWm2: Number(j(400, 650).toFixed(1)),
        },
        forecast: { gridLoadImpactPct: Number(j(2, 8).toFixed(1)), transformerTripRisk: "LOW", heatstrokeRiskIndex: "MODERATE", sustainedDurationHours: 0 },
      },
      warning: {
        healthScore: Math.round(j(44, 60)),
        signal: "Heat index climbing above comfort threshold.",
        metrics: {
          ambientTempC: Number(j(38, 41).toFixed(1)), feelsLikeTempC: Number(j(42, 46).toFixed(1)),
          surfaceTempC: Number(j(48, 54).toFixed(1)), uhiIntensityDeltaC: Number(j(2.5, 3.6).toFixed(1)),
          humidityPct: Number(j(40, 52).toFixed(1)), solarIrradianceWm2: Number(j(750, 860).toFixed(1)),
        },
        forecast: { gridLoadImpactPct: Number(j(18, 26).toFixed(1)), transformerTripRisk: "MEDIUM", heatstrokeRiskIndex: "HIGH", sustainedDurationHours: Number(j(2, 4).toFixed(1)) },
      },
      critical: {
        healthScore: 28,
        signal: "Severe Urban Heat Island spike (51.2°C feels-like). High grid overload risk & heatstroke hazard.",
        metrics: { ambientTempC: 44.8, feelsLikeTempC: 51.2, surfaceTempC: 58.4, uhiIntensityDeltaC: 4.6, humidityPct: 48.0, solarIrradianceWm2: 920.0 },
        forecast: { gridLoadImpactPct: 38.5, transformerTripRisk: "HIGH", heatstrokeRiskIndex: "SEVERE", sustainedDurationHours: 6.5 },
      },
    })[level],
  },

  transit_fleet: {
    forecastKey: "bottleneckForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(74, 95)),
        signal: "Bus fleet moving within normal speed bands.",
        metrics: {
          totalActiveBuses: Math.round(j(20, 55)), stoppedBuses: Math.round(j(0, 4)),
          stationaryRatio: Number(j(0.03, 0.12).toFixed(3)), avgFleetSpeedMps: Number(j(6, 9).toFixed(2)),
          affectedRouteCount: 0, topChokeRoute: "—",
        },
        forecast: { avgRouteDelayMins: Number(j(0, 4).toFixed(1)), busesInDepotMode: Math.round(j(0, 3)), transitGridlockRisk: "NOMINAL", spilloverToCorridor: "" },
      },
      warning: {
        healthScore: Math.round(j(46, 62)),
        signal: "Fleet speed dropping below threshold on primary route.",
        metrics: {
          totalActiveBuses: Math.round(j(30, 45)), stoppedBuses: Math.round(j(10, 18)),
          stationaryRatio: Number(j(0.35, 0.5).toFixed(3)), avgFleetSpeedMps: Number(j(1.8, 2.6).toFixed(2)),
          affectedRouteCount: Math.round(j(2, 4)), topChokeRoute: "Local arterial route",
        },
        forecast: { avgRouteDelayMins: Number(j(15, 24).toFixed(1)), busesInDepotMode: Math.round(j(1, 3)), transitGridlockRisk: "WARNING", spilloverToCorridor: "Adjacent junction" },
      },
      critical: {
        healthScore: 22,
        signal: "Critical fleet gridlock in Karol Bagh: 72.9% of 48 DTC buses stationary (<1.4 m/s). Route 813 stalled.",
        metrics: { totalActiveBuses: 48, stoppedBuses: 35, stationaryRatio: 0.729, avgFleetSpeedMps: 0.85, affectedRouteCount: 6, topChokeRoute: "Route 813 (Punjabi Bagh to ISBT Kashmere Gate)" },
        forecast: { avgRouteDelayMins: 42.5, busesInDepotMode: 3, transitGridlockRisk: "CRITICAL", spilloverToCorridor: "Ajmal Khan Road & Pusa Road Arterial Junction" },
      },
    })[level],
  },

  road_corridor: {
    forecastKey: "corridorForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(72, 94)),
        signal: "Corridor flowing near free-flow speed.",
        metrics: {
          corridorName: "Local arterial", freeFlowSpeedKmh: 50, currentAvgSpeedKmh: Number(j(38, 48).toFixed(1)),
          congestionLevelPct: Number(j(4, 18).toFixed(1)), jamLengthMeters: Math.round(j(0, 300)),
          bottleneckType: "None", avgDelayIndexMins: Number(j(0, 3).toFixed(1)),
        },
        forecast: { predictedSpeedIn20Mins: Number(j(38, 46).toFixed(1)), upstreamSpilloverSector: "", busCorridorInfiltration: "LOW", recommendedBypassRoute: "" },
      },
      warning: {
        healthScore: Math.round(j(45, 62)),
        signal: "Corridor speed dropping, queue lengthening.",
        metrics: {
          corridorName: "Secondary arterial", freeFlowSpeedKmh: 50, currentAvgSpeedKmh: Number(j(18, 26).toFixed(1)),
          congestionLevelPct: Number(j(45, 58).toFixed(1)), jamLengthMeters: Math.round(j(900, 1600)),
          bottleneckType: "Signal Failure", avgDelayIndexMins: Number(j(10, 16).toFixed(1)),
        },
        forecast: { predictedSpeedIn20Mins: Number(j(12, 18).toFixed(1)), upstreamSpilloverSector: "", busCorridorInfiltration: "MEDIUM", recommendedBypassRoute: "Alternate service road" },
      },
      critical: {
        healthScore: 31,
        signal: "Severe congestion on Outer Ring Road (12.4 km/h vs 55 km/h free flow). 2.8km queue spilling towards Preet Vihar.",
        metrics: { corridorName: "Outer Ring Road (Preet Vihar to Karkarduma)", freeFlowSpeedKmh: 55.0, currentAvgSpeedKmh: 12.4, congestionLevelPct: 77.5, jamLengthMeters: 2800, bottleneckType: "Flyover Merge Bottleneck", avgDelayIndexMins: 28.5 },
        forecast: { predictedSpeedIn20Mins: 6.2, upstreamSpilloverSector: "DEL_EAST_MV", busCorridorInfiltration: "HIGH", recommendedBypassRoute: "Vikas Marg via Nirman Vihar" },
      },
    })[level],
  },

  metro_transit: {
    forecastKey: "surgeForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(74, 95)),
        signal: "Platform crowding within safe operating range.",
        metrics: {
          passengerInflowPerMin: Math.round(j(200, 500)), platformCapacityPct: Number(j(30, 55).toFixed(1)),
          activeGateCount: 12, throttledGateCount: 0, avgPlatformWaitMins: Number(j(2, 5).toFixed(1)),
          lineTransferSurge: "None",
        },
        forecast: { gateClosureRisk: "LOW", surfaceOverflowRisk: "LOW", estimatedTimeToGateLock: 0, roadToRailOverflowRatio: Number(j(0.8, 1.1).toFixed(2)) },
      },
      warning: {
        healthScore: Math.round(j(46, 62)),
        signal: "Platform inflow surging above comfortable threshold.",
        metrics: {
          passengerInflowPerMin: Math.round(j(900, 1200)), platformCapacityPct: Number(j(70, 82).toFixed(1)),
          activeGateCount: 12, throttledGateCount: Math.round(j(1, 3)), avgPlatformWaitMins: Number(j(8, 12).toFixed(1)),
          lineTransferSurge: "Minor cross-line bottleneck",
        },
        forecast: { gateClosureRisk: "MEDIUM", surfaceOverflowRisk: "MEDIUM", estimatedTimeToGateLock: Math.round(j(25, 40)), roadToRailOverflowRatio: Number(j(1.6, 2.2).toFixed(2)) },
      },
      critical: {
        healthScore: 19,
        signal: "Critical crowding at Kashmere Gate Metro (94.5% platform capacity). 5 gates throttled; 18 min platform wait.",
        metrics: { passengerInflowPerMin: 1420, platformCapacityPct: 94.5, activeGateCount: 12, throttledGateCount: 5, avgPlatformWaitMins: 18.0, lineTransferSurge: "Yellow -> Red Line platform bottleneck" },
        forecast: { gateClosureRisk: "CRITICAL", surfaceOverflowRisk: "SEVERE", estimatedTimeToGateLock: 12, roadToRailOverflowRatio: 3.4 },
      },
    })[level],
  },

  power_grid: {
    forecastKey: "gridForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(75, 96)),
        signal: "Substation load within normal operating band.",
        metrics: {
          substationName: "Local 11kV feeder station", discomProvider: "BSES / TPDDL",
          transformerLoadPct: Number(j(40, 65).toFixed(1)), gridFrequencyHz: Number(j(49.85, 50.1).toFixed(2)),
          activeFeeders: 12, trippedFeeders: 0, trafficSignalsOffline: false, commercialBlackout: false,
        },
        forecast: { cascadeTripRisk: "LOW", estimatedRestorationMins: 0, trafficSignalImpactZone: "", backupPowerActive: true },
      },
      warning: {
        healthScore: Math.round(j(44, 60)),
        signal: "Feeder load approaching rated capacity.",
        metrics: {
          substationName: "Local 33kV distribution substation", discomProvider: "BSES / TPDDL",
          transformerLoadPct: Number(j(82, 90).toFixed(1)), gridFrequencyHz: Number(j(49.3, 49.7).toFixed(2)),
          activeFeeders: 12, trippedFeeders: Math.round(j(1, 2)), trafficSignalsOffline: false, commercialBlackout: false,
        },
        forecast: { cascadeTripRisk: "MEDIUM", estimatedRestorationMins: Math.round(j(20, 35)), trafficSignalImpactZone: "Nearby junctions", backupPowerActive: true },
      },
      critical: {
        healthScore: 14,
        signal: "Substation overload (98.2% load, 4 feeders tripped). Power blackout disabling traffic signals in Seelampur.",
        metrics: { substationName: "Seelampur 33kV Main Distribution Substation", discomProvider: "BSES Yamuna Power Limited (BYPL)", transformerLoadPct: 98.2, gridFrequencyHz: 48.85, activeFeeders: 12, trippedFeeders: 4, trafficSignalsOffline: true, commercialBlackout: true },
        forecast: { cascadeTripRisk: "EXTREME", estimatedRestorationMins: 75, trafficSignalImpactZone: "Seelampur & Shastri Park Junctions", backupPowerActive: false },
      },
    })[level],
  },

  industrial_hazard: {
    forecastKey: "hazardForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(80, 97)),
        signal: "No active hazard events; routine monitoring.",
        metrics: {
          zoneType: "Manufacturing / Light Industrial", incidentType: "none", hazardSeverityGrade: "Category-1",
          fireTendersDeployed: 0, toxicSmokePlume: false, chemicalAgent: "—",
          evacuationRadiusMeters: 0, roadClosureEnforced: false, windDirectionDeg: Math.round(j(0, 359)),
        },
        forecast: { plumeDriftDirection: "", estimatedContainmentHours: 0, evacuationUrgency: "NONE", roadDiversionImpact: "" },
      },
      warning: {
        healthScore: Math.round(j(40, 58)),
        signal: "Minor incident reported; fire crew dispatched precautionarily.",
        metrics: {
          zoneType: "Manufacturing Complex", incidentType: "structure_fire", hazardSeverityGrade: "Category-2",
          fireTendersDeployed: Math.round(j(2, 5)), toxicSmokePlume: false, chemicalAgent: "—",
          evacuationRadiusMeters: Math.round(j(150, 300)), roadClosureEnforced: true, windDirectionDeg: Math.round(j(0, 359)),
        },
        forecast: { plumeDriftDirection: "Localized", estimatedContainmentHours: Number(j(1, 2).toFixed(1)), evacuationUrgency: "ADVISORY", roadDiversionImpact: "Local road partially closed" },
      },
      critical: {
        healthScore: 10,
        signal: "Major industrial hazard: Chemical leak & fire in Bawana Sector-3. 14 fire tenders deployed; 800m evacuation zone active.",
        metrics: { zoneType: "Manufacturing & Chemical Industrial Complex", incidentType: "chemical_leak_and_fire", hazardSeverityGrade: "Category-3 (Major)", fireTendersDeployed: 14, toxicSmokePlume: true, chemicalAgent: "Ammonia Gas / Plastic Polymer Solvents", evacuationRadiusMeters: 800, roadClosureEnforced: true, windDirectionDeg: 135 },
        forecast: { plumeDriftDirection: "South-East towards Narela Transit Corridor", estimatedContainmentHours: 3.5, evacuationUrgency: "IMMEDIATE", roadDiversionImpact: "Bawana-Narela Road completely closed; heavy vehicle detour active" },
      },
    })[level],
  },

  hospital_capacity: {
    forecastKey: "healthcareForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(72, 93)),
        signal: "ICU occupancy within manageable range.",
        metrics: {
          primaryFacilityName: "District General Hospital", totalIcuBeds: Math.round(j(80, 200)),
          availableIcuBeds: Math.round(j(20, 60)), icuOccupancyPct: Number(j(45, 68).toFixed(1)),
          erVentilatorsInUse: Math.round(j(5, 20)), respiratoryAdmissionsHourly: Math.round(j(1, 5)),
          oxygenReserveHours: Number(j(40, 90).toFixed(1)), ambulanceAmbulatoryQueue: Math.round(j(0, 2)),
        },
        forecast: { estimatedTimeToIcuSaturationHours: 999, triageDivertingActive: false, secondaryFacilityTarget: "", primaryTriggerVector: "" },
      },
      warning: {
        healthScore: Math.round(j(42, 60)),
        signal: "Admissions surging above baseline; capacity tightening.",
        metrics: {
          primaryFacilityName: "District General Hospital", totalIcuBeds: Math.round(j(100, 180)),
          availableIcuBeds: Math.round(j(15, 25)), icuOccupancyPct: Number(j(80, 88).toFixed(1)),
          erVentilatorsInUse: Math.round(j(30, 50)), respiratoryAdmissionsHourly: Math.round(j(12, 20)),
          oxygenReserveHours: Number(j(18, 28).toFixed(1)), ambulanceAmbulatoryQueue: Math.round(j(3, 5)),
        },
        forecast: { estimatedTimeToIcuSaturationHours: Number(j(4, 7).toFixed(1)), triageDivertingActive: false, secondaryFacilityTarget: "Nearby secondary facility", primaryTriggerVector: "Seasonal admissions rise" },
      },
      critical: {
        healthScore: 20,
        signal: "Critical ICU capacity at Daryaganj Hospital Cluster (95.2% occupied, 12 beds left). Respiratory surge forcing ambulance diversion.",
        metrics: { primaryFacilityName: "Lok Nayak Jai Prakash Narayan (LNJP) Hospital", totalIcuBeds: 250, availableIcuBeds: 12, icuOccupancyPct: 95.2, erVentilatorsInUse: 88, respiratoryAdmissionsHourly: 34, oxygenReserveHours: 14.5, ambulanceAmbulatoryQueue: 9 },
        forecast: { estimatedTimeToIcuSaturationHours: 1.8, triageDivertingActive: true, secondaryFacilityTarget: "G.B. Pant Hospital / AIIMS Trauma Center", primaryTriggerVector: "Environmental PM2.5 Smog Surge" },
      },
    })[level],
  },

  emergency_dispatch: {
    forecastKey: "dispatchForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(74, 95)),
        signal: "112 call volume at baseline levels.",
        metrics: {
          callVolumePerMin: Math.round(j(4, 9)), baselineCallVolumeMin: 8,
          callVelocitySpikeRatio: Number(j(0.7, 1.2).toFixed(2)), activeDispatches: Math.round(j(1, 5)),
          primaryCallCategory: "routine", avgResponseTimeMins: Number(j(7, 12).toFixed(1)), dispatchQueueBacklog: 0,
        },
        forecast: { firstResponderExhaustion: "LOW", predictedResponseTime: Number(j(8, 12).toFixed(1)), incidentHotspotCorridor: "", crossAgencyEscalation: [] },
      },
      warning: {
        healthScore: Math.round(j(44, 60)),
        signal: "Call volume trending above baseline; backlog forming.",
        metrics: {
          callVolumePerMin: Math.round(j(18, 26)), baselineCallVolumeMin: 8,
          callVelocitySpikeRatio: Number(j(2.2, 3.2).toFixed(2)), activeDispatches: Math.round(j(8, 12)),
          primaryCallCategory: "traffic_collision", avgResponseTimeMins: Number(j(14, 19).toFixed(1)), dispatchQueueBacklog: Math.round(j(4, 7)),
        },
        forecast: { firstResponderExhaustion: "MEDIUM", predictedResponseTime: Number(j(18, 22).toFixed(1)), incidentHotspotCorridor: "Local corridor", crossAgencyEscalation: ["Delhi Traffic Police"] },
      },
      critical: {
        healthScore: 25,
        signal: "112 Call Surge: 5.25x baseline (42 calls/min) near Mayur Vihar. Multi-vehicle collision reported; 11 dispatches backlogged.",
        metrics: { callVolumePerMin: 42, baselineCallVolumeMin: 8, callVelocitySpikeRatio: 5.25, activeDispatches: 18, primaryCallCategory: "traffic_collision_and_medical", avgResponseTimeMins: 18.4, dispatchQueueBacklog: 11 },
        forecast: { firstResponderExhaustion: "HIGH", predictedResponseTime: 26.0, incidentHotspotCorridor: "NH-24 Akshardham Approach Road", crossAgencyEscalation: ["CATS Ambulance", "Delhi Traffic Police"] },
      },
    })[level],
  },

  social_panic: {
    forecastKey: "panicForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(75, 96)),
        signal: "Social sentiment neutral, no panic keyword spikes.",
        metrics: {
          processedPostsPerMin: Math.round(j(10, 40)), meanRoBERTaPanicScore: Number(j(0.05, 0.2).toFixed(3)),
          negativeSentimentPct: Number(j(8, 22).toFixed(1)), keywordVelocityRatio: Number(j(0.8, 1.2).toFixed(2)),
          topKeywords: [], viralPostCount: 0,
        },
        forecast: { perceivedCrisisSeverity: "NOMINAL", panicPropagationVelocity: "FLAT", misinformationRiskIndex: "LOW", publicCivicDistressTarget: [] },
      },
      warning: {
        healthScore: Math.round(j(45, 62)),
        signal: "Localized negative sentiment spike detected.",
        metrics: {
          processedPostsPerMin: Math.round(j(70, 110)), meanRoBERTaPanicScore: Number(j(0.4, 0.55).toFixed(3)),
          negativeSentimentPct: Number(j(55, 68).toFixed(1)), keywordVelocityRatio: Number(j(2.5, 3.5).toFixed(2)),
          topKeywords: ["delay", "crowded"], viralPostCount: Math.round(j(2, 5)),
        },
        forecast: { perceivedCrisisSeverity: "ELEVATED", panicPropagationVelocity: "LINEAR", misinformationRiskIndex: "MEDIUM", publicCivicDistressTarget: [] },
      },
      critical: {
        healthScore: 27,
        signal: "Social Panic Surge: RoBERTa panic score 0.84 (6.8x keyword velocity). Virality spiking around \"choking\" and \"trapped in bus\" near Laxmi Nagar.",
        metrics: { processedPostsPerMin: 184, meanRoBERTaPanicScore: 0.842, negativeSentimentPct: 89.5, keywordVelocityRatio: 6.8, topKeywords: ["choking", "visibility zero", "trapped in bus", "smog"], viralPostCount: 14 },
        forecast: { perceivedCrisisSeverity: "CRITICAL", panicPropagationVelocity: "EXPONENTIAL", misinformationRiskIndex: "HIGH", publicCivicDistressTarget: ["DEL_EAST_PV", "DEL_EAST_MV"] },
      },
    })[level],
  },

  traffic_news: {
    forecastKey: "advisoryForecast",
    tier: (level, j) => ({
      nominal: {
        healthScore: Math.round(j(78, 97)),
        signal: "No active advisories; roads clear.",
        metrics: {
          sourceType: "news_rss", closureType: "none", closureSeverity: "minor_diversion",
          officialAdvisoryId: "", verifiedByPolice: false, affectedCorridors: [], estimatedDurationHours: 0,
        },
        forecast: { unannouncedDiversionRisk: "LOW", publicTransitRerouteActive: false, secondaryChokeSectors: [] },
      },
      warning: {
        healthScore: Math.round(j(48, 64)),
        signal: "Planned procession reported; minor diversion advised.",
        metrics: {
          sourceType: "official_police_advisory", closureType: "planned_procession", closureSeverity: "minor_diversion",
          officialAdvisoryId: "DTP-ADV-LOCAL", verifiedByPolice: true, affectedCorridors: ["Local road"], estimatedDurationHours: Number(j(1, 2).toFixed(1)),
        },
        forecast: { unannouncedDiversionRisk: "MEDIUM", publicTransitRerouteActive: false, secondaryChokeSectors: [] },
      },
      critical: {
        healthScore: 35,
        signal: "Official Advisory: Unplanned protest roadblock at Connaught Place outer circle. Major arterial blocked; DTC buses rerouted.",
        metrics: { sourceType: "official_police_advisory", closureType: "unplanned_protest_roadblock", closureSeverity: "major_arterial_blocked", officialAdvisoryId: "DTP-ADV-2026-0810-44", verifiedByPolice: true, affectedCorridors: ["Outer Circle CP", "Barakhamba Road", "Janpath"], estimatedDurationHours: 4.0 },
        forecast: { unannouncedDiversionRisk: "HIGH", publicTransitRerouteActive: true, secondaryChokeSectors: ["DEL_NEW_LUTYENS", "DEL_OLD_SADAR"] },
      },
    })[level],
  },
};


// ── HOT_SIGNALS — the seeded cascade cluster ────────────────
//
// Anchored on Laxmi Nagar (smog + panic critical). The
// surrounding East Delhi sectors (Preet Vihar, Mayur Vihar,
// Kashmere Gate, Seelampur, Daryaganj) light up with warning/
// critical secondary agents — this is the visual proof of the
// spatial decay cascade. A few standalone anomalies elsewhere
// (Tilak Nagar flood, Nehru Place heat, Bawana hazard, Karol
// Bagh transit, Connaught Place advisory) round out coverage
// so all 12 agent visuals are demonstrably live at once.

const HOT_SIGNALS = [
  { sectorId: "DEL_EAST_LN",     agentId: "smog_dispersion",      tier: "critical" },
  { sectorId: "DEL_EAST_LN",     agentId: "social_panic",         tier: "critical" },
  { sectorId: "DEL_EAST_PV",     agentId: "road_corridor",        tier: "critical" },
  { sectorId: "DEL_EAST_PV",     agentId: "smog_dispersion",      tier: "warning"  },
  { sectorId: "DEL_EAST_MV",     agentId: "emergency_dispatch",   tier: "critical" },
  { sectorId: "DEL_EAST_MV",     agentId: "smog_dispersion",      tier: "warning"  },
  { sectorId: "DEL_NORTH_KGATE", agentId: "metro_transit",        tier: "critical" },
  { sectorId: "DEL_NEAST_SLP",   agentId: "power_grid",           tier: "critical" },
  { sectorId: "DEL_NEAST_DG",    agentId: "social_panic",         tier: "warning"  },
  { sectorId: "DEL_CENTRAL_DG",  agentId: "hospital_capacity",    tier: "critical" },

  // standalone anomalies — full agent-type coverage
  { sectorId: "DEL_WEST_TILAK",  agentId: "waterlogging_hydrology", tier: "critical" },
  { sectorId: "DEL_SEAST_NP",    agentId: "thermal_stress",       tier: "critical" },
  { sectorId: "DEL_CENTRAL_KB",  agentId: "transit_fleet",        tier: "critical" },
  { sectorId: "DEL_ONORTH_BAWANA", agentId: "industrial_hazard",  tier: "critical" },
  { sectorId: "DEL_CENTRAL_CP",  agentId: "traffic_news",         tier: "critical" },
];

const HOT_LOOKUP = HOT_SIGNALS.reduce((acc, h) => {
  acc[`${h.sectorId}:${h.agentId}`] = h.tier;
  return acc;
}, {});


// ── Signal builder ───────────────────────────────────────────

function anomalyLevelForTier(tier) {
  if (tier === "critical") return "critical";
  if (tier === "warning") return "warning";
  return "nominal";
}

function buildSignal(sector, agentId) {
  const tier = HOT_LOOKUP[`${sector.sectorId}:${agentId}`] || "nominal";

  const profile = AGENT_PROFILES[agentId];
  const seed = seedFrom(`${sector.sectorId}:${agentId}`);
  const j = (lo, hi) => jitter(seed, lo, hi);

  const preset = profile.tier(tier, j);

  return {
    agentId,
    domain: AGENT_META[agentId]?.domain,

    sectorId: sector.sectorId,
    district: sector.district,

    // per-sector live-anchor flag from the sector table, further
    // gated by whether this particular agent is a live-anchor type
    isLiveAnchor:
      sector.isLiveAnchor &&
      ["smog_dispersion", "transit_fleet", "road_corridor", "metro_transit", "social_panic", "traffic_news"].includes(agentId),

    healthScore: preset.healthScore,
    anomalyLevel: anomalyLevelForTier(tier),
    signal: preset.signal,

    location: {
      placeName: sector.name,
      lat: sector.lat,
      lng: sector.lng,
      radiusMeters:
        tier === "critical" ? 900 : tier === "warning" ? 500 : 250,
    },

    metrics: preset.metrics,

    ...(profile.forecastKey ? { [profile.forecastKey]: preset.forecast } : {}),

    timestamp: new Date().toISOString(),
  };
}


// ── MOCK_SIGNALS — the full 39 x 12 mesh ────────────────────

export const MOCK_SIGNALS = SECTORS.flatMap((sector) =>
  ALL_AGENT_IDS.map((agentId) => buildSignal(sector, agentId))
);


// ── Mock Cascade (fallback if the decay engine can't compute one) ──

export const MOCK_CASCADE = {
  alertId: "ALT_DEMO_0001",
  primarySectorId: "DEL_EAST_LN",
  primarySectorName: "Laxmi Nagar",
  district: "East Delhi",
  cascadeScore: 0.82,
  confidence: 91,
  predictedEvent: "Severe urban smog cascade",
  hoursUntil: 38,
  spatialSpread: ["DEL_EAST_PV", "DEL_EAST_MV", "DEL_NORTH_KGATE", "DEL_NEAST_SLP", "DEL_CENTRAL_DG"],
  triggeredAgents: ["smog_dispersion", "social_panic", "road_corridor", "metro_transit", "power_grid", "hospital_capacity"],
  recommendations: [
    "Issue public health advisory immediately",
    "Advise schools to shift to indoor activity",
    "Deploy traffic police to affected corridors",
  ],
  timestamp: new Date().toISOString(),
};


// ── Mock Citywide Incident (NEW) ─────────────────────────────
//
// Fallback for the "AutoNet Citywide Multi-Agent Cascade
// Aggregation" schema — used when GhostnetContext can't compute
// a real one locally (no active per-sector cascades yet) and the
// backend's /test-city-incident endpoint isn't reachable either.
// Matches the required top-level keys exactly:
// incidentId, citywideSeverity, citywideCascadeScore, summary,
// affectedAreas, rootCauseDomain, mitigationMeasures, timestamp.

export const MOCK_CITY_INCIDENT = {
  incidentId: "CITY_INCIDENT_DEMO_0001",
  citywideSeverity: "CRITICAL",
  citywideCascadeScore: 0.84,
  summary:
    "Severe monsoonal flash flooding in Central Delhi underpasses causing cross-district bus gridlock and local power transformer trips.",
  rootCauseDomain: "waterlogging_hydrology",
  affectedAreas: [
    {
      district: "Central Delhi",
      primarySectorId: "DEL_CENTRAL_CP",
      secondarySectors: ["DEL_CENTRAL_KB", "DEL_OLD_CHANDNI"],
      impactedDomains: ["waterlogging_hydrology", "transit_fleet", "power_grid"],
      affectedBy: {
        primaryThreat: "Minto Bridge Flash Inundation & Substation Tripping",
        description:
          "42cm standing water at underpass halting DTC routes and causing thermal overload on local distribution transformers.",
        metrics: {
          waterDepthCm: 42.0,
          busStationaryRatio: 0.78,
          gridLoadImpactPct: 91.2,
        },
      },
    },
    {
      district: "East Delhi",
      primarySectorId: "DEL_EAST_LN",
      secondarySectors: ["DEL_EAST_PV", "DEL_EAST_MV"],
      impactedDomains: ["smog_dispersion", "social_panic", "hospital_capacity"],
      affectedBy: {
        primaryThreat: "Severe PM2.5 Stagnation & Panic Surge",
        description:
          "Stagnant smog plume (382 AQI) combined with viral social panic driving respiratory ER admissions up sharply.",
        metrics: {
          aqi: 382,
          meanRoBERTaPanicScore: 0.842,
          icuOccupancyPct: 95.2,
        },
      },
    },
  ],
  mitigationMeasures: {
    immediateDirectives: [
      {
        action: "Activate high-capacity mobile dewatering pumps at Minto Bridge underpass.",
        targetAgency: "PWD / MCD",
        priority: "P1_CRITICAL",
      },
      {
        action: "Deploy additional traffic police to unsignaled junctions during power outage.",
        targetAgency: "Delhi Traffic Police",
        priority: "P1_CRITICAL",
      },
      {
        action: "Pre-position ambulances near LNJP Hospital for respiratory overflow.",
        targetAgency: "CATS Ambulance / Delhi Health Dept.",
        priority: "P2_HIGH",
      },
    ],
    trafficAndTransitRerouting: [
      {
        affectedCorridor: "Connaught Place Radial Roads & Minto Road",
        bypassRoute: "DDU Marg -> Deen Dayal Upadhyaya flyover bypass",
        transitAdjustment: "DTC Line 419 diverted via Barakhamba Road to avoid Minto underpass.",
      },
      {
        affectedCorridor: "Vikas Marg & Laxmi Nagar Metro Corridor",
        bypassRoute: "Nirman Vihar flyover alternate route",
        transitAdjustment: "Bus services rerouted away from low-visibility smog corridor.",
      },
    ],
    publicAdvisories: [
      {
        channel: "Delhi Traffic Police Twitter / RSS & FM Broadcast",
        headline: "AVOID Minto Bridge Underpass & Outer Circle CP",
        message:
          "Severe waterlogging at Minto Bridge. Use DDU Marg or Barakhamba Road for East-West movement.",
      },
      {
        channel: "DPCC Public Health Advisory",
        headline: "Severe Air Quality — East Delhi",
        message:
          "AQI at severe levels near Laxmi Nagar. Sensitive groups advised to remain indoors.",
      },
    ],
  },
  timestamp: new Date().toISOString(),
};

export { SECTOR_BY_ID };