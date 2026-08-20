/**
 * GHOSTNET Backend Constants
 */

export const SOCKET_EVENTS = Object.freeze({
  AGENT_SIGNAL: "agent-signal",
  CASCADE_ALERT: "cascade-alert",
  CASCADE_CLEAR: "cascade-clear",
  AGENT_COMMS: "agent-comms",
  CITY_INCIDENT: "city-incident",
  CITY_INCIDENT_CLEAR: "city-incident-clear",
});

export const ALL_AGENT_IDS = Object.freeze([
  "smog_dispersion",
  "waterlogging_hydrology",
  "thermal_stress",
  "transit_fleet",
  "road_corridor",
  "metro_transit",
  "power_grid",
  "industrial_hazard",
  "hospital_capacity",
  "emergency_dispatch",
  "social_panic",
  "traffic_news",
]);

export const ANOMALY_LEVELS = Object.freeze(["nominal", "warning", "critical"]);

export const CITY_SEVERITY_LEVELS = Object.freeze(["NOMINAL", "ELEVATED", "HIGH", "CRITICAL"]);

export const CITY_ROOT_CAUSE_DOMAINS = Object.freeze([
  "environment",
  "transit",
  "infrastructure",
  "civic",
  "Power & Energy Grid",
  "Traffic & Transit",
  "Water & Hydrology",
  "Severe Weather",
  "Public Health",
  "smog_dispersion",
  "waterlogging_hydrology",
  "thermal_stress",
  "transit_fleet",
  "road_corridor",
  "metro_transit",
  "power_grid",
  "industrial_hazard",
  "hospital_capacity",
  "emergency_dispatch",
  "social_panic",
  "traffic_news"
]);
