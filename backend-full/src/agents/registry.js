import {
  ALL_AGENT_IDS,
  ANOMALY_LEVELS,
  CITY_SEVERITY_LEVELS,
  CITY_ROOT_CAUSE_DOMAINS
} from "../lib/constants.js";
import { SECTOR_BY_ID } from "../lib/sectors.js";

/**
 * Type checker helper
 */
function checkType(val, type) {
  if (type === "number") {
    return typeof val === "number" && !Number.isNaN(val);
  }
  if (type === "string") {
    return typeof val === "string";
  }
  if (type === "boolean") {
    return typeof val === "boolean";
  }
  if (type === "array_of_string") {
    return Array.isArray(val) && val.every(item => typeof item === "string");
  }
  if (type === "string_or_number") {
    return (typeof val === "string") || (typeof val === "number" && !Number.isNaN(val));
  }
  if (type === "boolean_or_string_or_number") {
    return typeof val === "boolean" || typeof val === "string" || (typeof val === "number" && !Number.isNaN(val));
  }
  return false;
}

/**
 * Helper to extract clean string from possible Python enum representations
 * e.g. "<CitywideSeverity.CRITICAL: 'CRITICAL'>" -> "CRITICAL"
 */
function cleanEnumValue(val) {
  if (typeof val !== "string") return val;
  const match = val.match(/:\s*['"]?([A-Za-z0-9_]+)['"]?>/);
  if (match) return match[1];
  return val;
}

/**
 * 12-agent lookup table with exact metric schemas and types.
 */
export const AGENT_REGISTRY = {
  smog_dispersion: {
    agentId: "smog_dispersion",
    domain: "environment",
    forecastKey: "diffusionForecast",
    metricsSchema: {
      pm25: "number",
      pm10: "number",
      aqi: "number",
      windSpeedKmh: "number",
      windDirectionDeg: "number",
      visibilityMeters: "number",
      stagnationIndex: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "smog_dispersion");
    },
  },

  waterlogging_hydrology: {
    agentId: "waterlogging_hydrology",
    domain: "environment",
    forecastKey: "floodForecast",
    metricsSchema: {
      rainfallRateMmHr: "number",
      accumulatedRain24hMm: "number",
      waterDepthCm: "number",
      drainAbsorptionCapPct: "number",
      underpassFlooded: "boolean",
      pumpStatus: "string",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "waterlogging_hydrology");
    },
  },

  thermal_stress: {
    agentId: "thermal_stress",
    domain: "environment",
    forecastKey: "thermalForecast",
    metricsSchema: {
      ambientTempC: "number",
      feelsLikeTempC: "number",
      surfaceTempC: "number",
      uhiIntensityDeltaC: "number",
      humidityPct: "number",
      solarIrradianceWm2: "number",
    },
    validateMetrics(metrics) {
      if (metrics && typeof metrics === "object") {
        if (metrics.humidityPct === undefined && metrics.humidity !== undefined) {
          metrics.humidityPct = metrics.humidity;
        } else if (metrics.humidityPct === undefined && metrics.relativeHumidity !== undefined) {
          metrics.humidityPct = metrics.relativeHumidity;
        } else if (metrics.humidityPct === undefined && metrics.humidityPercentage !== undefined) {
          metrics.humidityPct = metrics.humidityPercentage;
        } else if (metrics.humidityPct === undefined) {
          metrics.humidityPct = 50; // Fallback if omitted by agent
        }
      }
      return validateMetricsObject(metrics, this.metricsSchema, "thermal_stress");
    },
  },

  transit_fleet: {
    agentId: "transit_fleet",
    domain: "transit",
    forecastKey: "bottleneckForecast",
    metricsSchema: {
      totalActiveBuses: "number",
      stoppedBuses: "number",
      stationaryRatio: "number",
      avgFleetSpeedMps: "number",
      affectedRouteCount: "number",
      topChokeRoute: "string",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "transit_fleet");
    },
  },

  road_corridor: {
    agentId: "road_corridor",
    domain: "transit",
    forecastKey: "corridorForecast",
    metricsSchema: {
      corridorName: "string",
      freeFlowSpeedKmh: "number",
      currentAvgSpeedKmh: "number",
      congestionLevelPct: "number",
      jamLengthMeters: "number",
      bottleneckType: "string",
      avgDelayIndexMins: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "road_corridor");
    },
  },

  metro_transit: {
    agentId: "metro_transit",
    domain: "transit",
    forecastKey: "surgeForecast",
    metricsSchema: {
      passengerInflowPerMin: "number",
      platformCapacityPct: "number",
      activeGateCount: "number",
      throttledGateCount: "number",
      avgPlatformWaitMins: "number",
      lineTransferSurge: "boolean_or_string_or_number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "metro_transit");
    },
  },

  power_grid: {
    agentId: "power_grid",
    domain: "infrastructure",
    forecastKey: "gridForecast",
    metricsSchema: {
      substationName: "string",
      discomProvider: "string",
      transformerLoadPct: "number",
      gridFrequencyHz: "number",
      activeFeeders: "number",
      trippedFeeders: "number",
      trafficSignalsOffline: "boolean_or_string_or_number",
      commercialBlackout: "boolean",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "power_grid");
    },
  },

  industrial_hazard: {
    agentId: "industrial_hazard",
    domain: "infrastructure",
    forecastKey: "hazardForecast",
    metricsSchema: {
      zoneType: "string",
      incidentType: "string",
      hazardSeverityGrade: "string_or_number",
      fireTendersDeployed: "number",
      toxicSmokePlume: "boolean",
      chemicalAgent: "string_or_number",
      evacuationRadiusMeters: "number",
      roadClosureEnforced: "boolean",
      windDirectionDeg: "number",
    },
    validateMetrics(metrics) {
      if (metrics && typeof metrics === "object") {
        if (metrics.chemicalAgent === undefined) {
          metrics.chemicalAgent = metrics.chemical || "none";
        }
        if (metrics.windDirectionDeg === undefined) {
          metrics.windDirectionDeg = metrics.windDirection || 0;
        }
      }
      return validateMetricsObject(metrics, this.metricsSchema, "industrial_hazard");
    },
  },

  hospital_capacity: {
    agentId: "hospital_capacity",
    domain: "infrastructure",
    forecastKey: "healthcareForecast",
    metricsSchema: {
      primaryFacilityName: "string",
      totalIcuBeds: "number",
      availableIcuBeds: "number",
      icuOccupancyPct: "number",
      erVentilatorsInUse: "number",
      respiratoryAdmissionsHourly: "number",
      oxygenReserveHours: "number",
      ambulanceAmbulatoryQueue: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "hospital_capacity");
    },
  },

  emergency_dispatch: {
    agentId: "emergency_dispatch",
    domain: "civic",
    forecastKey: "dispatchForecast",
    metricsSchema: {
      callVolumePerMin: "number",
      baselineCallVolumeMin: "number",
      callVelocitySpikeRatio: "number",
      activeDispatches: "number",
      primaryCallCategory: "string",
      avgResponseTimeMins: "number",
      dispatchQueueBacklog: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "emergency_dispatch");
    },
  },

  social_panic: {
    agentId: "social_panic",
    domain: "civic",
    forecastKey: "panicForecast",
    metricsSchema: {
      processedPostsPerMin: "number",
      meanRoBERTaPanicScore: "number",
      negativeSentimentPct: "number",
      keywordVelocityRatio: "number",
      topKeywords: "array_of_string",
      viralPostCount: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "social_panic");
    },
  },

  traffic_news: {
    agentId: "traffic_news",
    domain: "civic",
    forecastKey: "advisoryForecast",
    metricsSchema: {
      sourceType: "string",
      closureType: "string",
      closureSeverity: "string",
      officialAdvisoryId: "string",
      verifiedByPolice: "boolean",
      affectedCorridors: "array_of_string",
      estimatedDurationHours: "number",
    },
    validateMetrics(metrics) {
      return validateMetricsObject(metrics, this.metricsSchema, "traffic_news");
    },
  },
};

/**
 * Validates a metrics object against a schema definition.
 */
function validateMetricsObject(metrics, schema, agentId) {
  const errors = [];
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return { valid: false, errors: [`metrics must be a non-null object for agent '${agentId}'`] };
  }

  for (const [key, expectedType] of Object.entries(schema)) {
    if (metrics[key] === undefined || metrics[key] === null) {
      errors.push(`Missing required metric '${key}' for agent '${agentId}'`);
    } else if (!checkType(metrics[key], expectedType)) {
      errors.push(
        `Metric '${key}' must be of type '${expectedType}'. Received: ${typeof metrics[key]} (${JSON.stringify(metrics[key])})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes an incoming cascade alert payload to unwrap envelopes and map aliases robustly.
 */
export function normalizeCascadeAlert(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return rawPayload;
  const p = rawPayload.alert || rawPayload.cascade || rawPayload.data || rawPayload.payload || rawPayload;

  const primarySectorId = p.primarySectorId || p.sectorId || p.primary_sector_id || p.sector_id || p.sector || p.targetSector || p.target_sector;
  const sectorMeta = primarySectorId ? SECTOR_BY_ID[primarySectorId] : null;
  const primarySectorName = p.primarySectorName || p.primary_sector_name || p.sectorName || p.sector_name || p.name || sectorMeta?.name;
  const district = p.district || p.districtName || p.district_name || sectorMeta?.district;

  let rawScore = p.cascadeScore ?? p.cascade_score ?? p.score ?? p.riskScore ?? p.risk_score ?? p.risk ?? p.probability ?? p.cascadeProbability ?? p.cascade_probability ?? p.severityScore ?? p.severity_score ?? p.impact;
  if (typeof rawScore === "string" && !isNaN(Number(rawScore))) {
    rawScore = Number(rawScore);
  }
  const cascadeScore = typeof rawScore === "number" && !isNaN(rawScore) ? rawScore : undefined;

  let rawConfidence = p.confidence ?? p.confidenceScore ?? p.confidence_score ?? p.confidencePct ?? p.confidence_pct;
  if (typeof rawConfidence === "string" && !isNaN(Number(rawConfidence))) {
    rawConfidence = Number(rawConfidence);
  }
  const confidence = typeof rawConfidence === "number" && !isNaN(rawConfidence)
    ? rawConfidence
    : (cascadeScore != null ? Math.min(99, Math.round(75 + (typeof cascadeScore === "number" ? cascadeScore : 0.8) * 25)) : undefined);

  const alertId = p.alertId || p.alert_id || p.id || (primarySectorId ? `ALT_${Date.now()}_${primarySectorId}` : undefined);
  const predictedEvent = p.predictedEvent || p.predicted_event || p.event || p.title || p.summary || p.description || (primarySectorName ? `Infrastructural cascade at ${primarySectorName}` : undefined);
  const hoursUntil = Number(p.hoursUntil ?? p.hours_until ?? p.etaHours ?? p.eta_hours ?? p.timeToImpact ?? p.time_to_impact ?? 1.0);
  const spatialSpread = Array.isArray(p.spatialSpread) ? p.spatialSpread : (Array.isArray(p.spatial_spread) ? p.spatial_spread : (primarySectorId ? [primarySectorId] : undefined));
  const triggeredAgents = Array.isArray(p.triggeredAgents) ? p.triggeredAgents : (Array.isArray(p.triggered_agents) ? p.triggered_agents : (Array.isArray(p.agents) ? p.agents : (p.agentId ? [p.agentId] : (p.agent_id ? [p.agent_id] : []))));
  const recommendations = Array.isArray(p.recommendations) ? p.recommendations : (Array.isArray(p.mitigation) ? p.mitigation : (Array.isArray(p.actions) ? p.actions : (typeof p.recommendation === "string" ? [p.recommendation] : (typeof p.action === "string" ? [p.action] : (primarySectorName ? [`Deploy response teams across ${primarySectorName}`] : undefined)))));
  const timestamp = p.timestamp || new Date().toISOString();

  return {
    ...p,
    alertId,
    primarySectorId,
    primarySectorName,
    district,
    cascadeScore,
    confidence,
    predictedEvent,
    hoursUntil,
    spatialSpread,
    triggeredAgents,
    recommendations,
    timestamp,
  };
}

/**
 * Validates an incoming agent-signal payload against the strict contract.
 */
export function validateAgentSignal(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  const requiredFields = [
    "agentId",
    "domain",
    "sectorId",
    "district",
    "isLiveAnchor",
    "healthScore",
    "anomalyLevel",
    "signal",
    "location",
    "metrics",
    "timestamp",
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (payload.agentId && !ALL_AGENT_IDS.includes(payload.agentId)) {
    errors.push(`Unknown agentId '${payload.agentId}'. Must be one of: ${ALL_AGENT_IDS.join(", ")}`);
  }

  const agentDef = AGENT_REGISTRY[payload.agentId];
  if (agentDef && payload.domain && payload.domain !== agentDef.domain) {
    errors.push(`Domain mismatch for agent '${payload.agentId}'. Expected '${agentDef.domain}', received '${payload.domain}'`);
  }

  if (payload.healthScore !== undefined) {
    if (typeof payload.healthScore !== "number" || Number.isNaN(payload.healthScore) || payload.healthScore < 0 || payload.healthScore > 100) {
      errors.push(`healthScore must be a number between 0 and 100. Received: ${payload.healthScore}`);
    }
  }

  if (payload.isLiveAnchor !== undefined && typeof payload.isLiveAnchor !== "boolean") {
    errors.push(`isLiveAnchor must be a boolean. Received: ${typeof payload.isLiveAnchor}`);
  }

  if (payload.anomalyLevel && !ANOMALY_LEVELS.includes(payload.anomalyLevel)) {
    errors.push(`anomalyLevel must be one of [${ANOMALY_LEVELS.join(", ")}]. Received: ${payload.anomalyLevel}`);
  }

  if (payload.location) {
    if (typeof payload.location !== "object" || Array.isArray(payload.location)) {
      errors.push("location must be an object");
    } else {
      if (typeof payload.location.lat !== "number" || Number.isNaN(payload.location.lat)) {
        errors.push("location.lat must be a number");
      }
      if (typeof payload.location.lng !== "number" || Number.isNaN(payload.location.lng)) {
        errors.push("location.lng must be a number");
      }
      if (typeof payload.location.placeName !== "string") {
        errors.push("location.placeName must be a string");
      }
      if (typeof payload.location.radiusMeters !== "number" || Number.isNaN(payload.location.radiusMeters)) {
        errors.push("location.radiusMeters must be a number");
      }
    }
  }

  if (agentDef && payload.metrics) {
    const metricsValidation = agentDef.validateMetrics(payload.metrics);
    if (!metricsValidation.valid) {
      errors.push(...metricsValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a cascade-alert payload.
 */
export function validateCascadeAlert(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  const requiredFields = [
    "alertId",
    "primarySectorId",
    "primarySectorName",
    "district",
    "cascadeScore",
    "confidence",
    "predictedEvent",
    "hoursUntil",
    "spatialSpread",
    "triggeredAgents",
    "recommendations",
    "timestamp",
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (payload.alertId !== undefined && typeof payload.alertId !== "string") {
    errors.push("alertId must be a string");
  }

  if (payload.primarySectorName !== undefined && typeof payload.primarySectorName !== "string") {
    errors.push("primarySectorName must be a string");
  }

  if (payload.district !== undefined && typeof payload.district !== "string") {
    errors.push("district must be a string");
  }

  if (payload.cascadeScore !== undefined && (typeof payload.cascadeScore !== "number" || Number.isNaN(payload.cascadeScore))) {
    errors.push("cascadeScore must be a number");
  }

  if (payload.confidence !== undefined && (typeof payload.confidence !== "number" || Number.isNaN(payload.confidence))) {
    errors.push("confidence must be a number");
  }

  if (payload.hoursUntil !== undefined && (typeof payload.hoursUntil !== "number" || Number.isNaN(payload.hoursUntil))) {
    errors.push("hoursUntil must be a number");
  }

  if (payload.predictedEvent !== undefined && typeof payload.predictedEvent !== "string") {
    errors.push("predictedEvent must be a string");
  }

  if (payload.spatialSpread !== undefined && !Array.isArray(payload.spatialSpread)) {
    errors.push("spatialSpread must be an array of sector IDs");
  }

  if (payload.triggeredAgents !== undefined && !Array.isArray(payload.triggeredAgents)) {
    errors.push("triggeredAgents must be an array of agent IDs");
  }

  if (payload.recommendations !== undefined && !Array.isArray(payload.recommendations)) {
    errors.push("recommendations must be an array of strings");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a cascade-clear payload.
 */
export function validateCascadeClear(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  const hasTarget = payload.primarySectorId || payload.sectorId || payload.alertId;
  if (!hasTarget) {
    errors.push("Payload must specify primarySectorId, sectorId, or alertId");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an agent-comms payload.
 */
export function validateAgentComms(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  const sender = payload.from || payload.sourceAgentId;
  const receiver = payload.to || payload.targetAgentId;
  const content = payload.message || payload.content || payload.body;

  if (!sender || typeof sender !== "string") {
    errors.push("Missing or invalid 'from' / 'sourceAgentId'");
  }
  if (!receiver || typeof receiver !== "string") {
    errors.push("Missing or invalid 'to' / 'targetAgentId'");
  }
  if (!content || typeof content !== "string") {
    errors.push("Missing or invalid 'message' / 'content'");
  }
  if (!payload.timestamp) {
    errors.push("Missing required field: timestamp");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a city-incident payload strictly against AutoNet JSON schema.
 */
export function validateCityIncident(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  const requiredFields = [
    "incidentId",
    "citywideSeverity",
    "citywideCascadeScore",
    "summary",
    "affectedAreas",
    "rootCauseDomain",
    "mitigationMeasures",
    "timestamp",
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (payload.incidentId !== undefined && typeof payload.incidentId !== "string") {
    errors.push("incidentId must be a string");
  }

  const cleanSeverity = cleanEnumValue(payload.citywideSeverity);
  if (cleanSeverity && !CITY_SEVERITY_LEVELS.includes(String(cleanSeverity).toUpperCase())) {
    errors.push(`citywideSeverity must be one of: ${CITY_SEVERITY_LEVELS.join(", ")}`);
  }

  if (payload.citywideCascadeScore !== undefined && (typeof payload.citywideCascadeScore !== "number" || Number.isNaN(payload.citywideCascadeScore))) {
    errors.push("citywideCascadeScore must be a number");
  }

  if (payload.summary !== undefined && typeof payload.summary !== "string") {
    errors.push("summary must be a string");
  }

  const cleanDomain = cleanEnumValue(payload.rootCauseDomain);
  if (cleanDomain && !CITY_ROOT_CAUSE_DOMAINS.includes(cleanDomain) && !CITY_ROOT_CAUSE_DOMAINS.includes(String(cleanDomain).toLowerCase())) {
    errors.push(`rootCauseDomain must be one of valid domains. Received: ${payload.rootCauseDomain}`);
  }

  if (payload.affectedAreas !== undefined && !Array.isArray(payload.affectedAreas)) {
    errors.push("affectedAreas must be an array");
  }

  if (payload.mitigationMeasures !== undefined) {
    if (typeof payload.mitigationMeasures !== "object") {
      errors.push("mitigationMeasures must be an array or object");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a city-incident-clear payload.
 */
export function validateCityIncidentClear(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  if (!payload.incidentId && !payload.clearedAt && !payload.timestamp) {
    errors.push("Payload must specify incidentId or timestamp/clearedAt");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
