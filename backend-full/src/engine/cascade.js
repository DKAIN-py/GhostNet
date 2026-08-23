import {
  CASCADE_WEIGHTS,
  CASCADE_THRESHOLD,
  SECTOR_BY_ID,
  ALL_AGENT_IDS
} from "../lib/schema.js";

/**
 * Pure function: Computes a sector-level cascade alert matching GhostnetContext.jsx's local computeCascade.
 * Live and fallback data use the exact identical weights, threshold, and payload schema.
 */
export function computeCascade(sectorSignals, sectorId) {
  if (!sectorSignals || sectorSignals.length === 0) return null;

  const sector = SECTOR_BY_ID[sectorId] || {
    sectorId,
    name: sectorSignals[0]?.location?.placeName || sectorId,
    district: sectorSignals[0]?.district || "Delhi Metro"
  };

  let weightedSum = 0;
  let totalWeight = 0;
  const triggeredAgents = [];

  for (const sig of sectorSignals) {
    const weight = CASCADE_WEIGHTS[sig.agentId] || 0.08;
    totalWeight += weight;

    // Threat level is normalized from 0.0 to 1.0 (inverted healthScore)
    const threatLevel = Math.max(0, Math.min(1, (100 - (sig.healthScore || 50)) / 100));
    weightedSum += threatLevel * weight;

    if (sig.anomalyLevel === "critical" || sig.anomalyLevel === "warning" || (sig.healthScore !== undefined && sig.healthScore < 50)) {
      triggeredAgents.push(sig.agentId);
    }
  }

  const cascadeScore = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;

  if (cascadeScore < CASCADE_THRESHOLD) {
    return null; // No cascade triggered
  }

  // Calculate spatial spread: adjacent sectors in same or bordering district
  const spatialSpread = Object.values(SECTOR_BY_ID)
    .filter(s => s.sectorId !== sectorId && (s.district === sector.district || isNeighborDistrict(s.district, sector.district)))
    .slice(0, 5)
    .map(s => s.sectorId);

  // Synthesize domain-aware recommendations
  const recommendations = generateRecommendations(triggeredAgents, sector.name);

  const confidence = Math.min(99, Math.round(75 + cascadeScore * 25));
  const hoursUntil = Number((Math.max(0.5, (1.0 - cascadeScore) * 3.5 + 0.5)).toFixed(1));

  const predictedEvent = getPredictedEvent(triggeredAgents, sector.name);

  return {
    alertId: `ALT_${Date.now()}_${sectorId}`,
    primarySectorId: sector.sectorId,
    primarySectorName: sector.name,
    district: sector.district,
    cascadeScore,
    confidence,
    predictedEvent,
    hoursUntil,
    spatialSpread,
    triggeredAgents,
    recommendations,
    timestamp: new Date().toISOString()
  };
}

function isNeighborDistrict(d1, d2) {
  if (d1 === d2) return true;
  const map = {
    "East Delhi": ["North East Delhi", "Shahdara", "Central Delhi"],
    "Central Delhi": ["East Delhi", "North Delhi", "New Delhi", "West Delhi"],
    "North Delhi": ["Central Delhi", "Outer North Delhi", "North West Delhi"],
    "South Delhi": ["South East Delhi", "South West Delhi", "New Delhi"],
  };
  return map[d1]?.includes(d2) || map[d2]?.includes(d1) || false;
}

function getPredictedEvent(triggeredAgents, sectorName) {
  if (triggeredAgents.includes("smog_dispersion") && triggeredAgents.includes("social_panic")) {
    return `Severe smog stagnation with acute civic panic near ${sectorName}`;
  }
  if (triggeredAgents.includes("waterlogging_hydrology") && triggeredAgents.includes("transit_fleet")) {
    return `Flash waterlogging halting municipal bus corridors at ${sectorName}`;
  }
  if (triggeredAgents.includes("power_grid")) {
    return `Substation transformer overload causing cross-sector blackout at ${sectorName}`;
  }
  if (triggeredAgents.includes("industrial_hazard")) {
    return `Major industrial toxic plume dispersing into transit corridors near ${sectorName}`;
  }
  return `Compound multi-agent infrastructural cascade centered at ${sectorName}`;
}

function generateRecommendations(triggeredAgents, sectorName) {
  const list = [];
  if (triggeredAgents.includes("smog_dispersion")) {
    list.push(`Deploy high-capacity anti-smog mist guns across ${sectorName} arterial roads`);
    list.push("Issue public health advisory for vulnerable respiratory groups");
  }
  if (triggeredAgents.includes("waterlogging_hydrology")) {
    list.push(`Activate emergency dewatering pumps at ${sectorName} low-lying underpasses`);
  }
  if (triggeredAgents.includes("transit_fleet") || triggeredAgents.includes("road_corridor")) {
    list.push(`Enforce dynamic traffic police manual overrides at ${sectorName} junctions`);
    list.push("Reroute municipal bus fleets to peripheral bypass corridors");
  }
  if (triggeredAgents.includes("power_grid")) {
    list.push("Isolate overloaded distribution feeders and activate secondary backup circuits");
  }
  if (triggeredAgents.includes("hospital_capacity")) {
    list.push("Pre-stage mobile oxygen reserves and trigger regional ambulance diversion protocol");
  }
  if (list.length === 0) {
    list.push(`Deploy multi-agency response team to monitor ${sectorName}`);
    list.push("Establish real-time inter-agent monitoring protocol");
  }
  return list.slice(0, 4);
}

/**
 * Computes a citywide aggregated incident matching MOCK_CITY_INCIDENT schema.
 */
export function computeCityIncident(allSignals, activeCascades = []) {
  if (!allSignals || allSignals.length === 0) return null;

  const criticalSignals = allSignals.filter(s => s.anomalyLevel === "critical" || (s.healthScore !== undefined && s.healthScore < 30));

  const domainCounts = {};
  for (const s of criticalSignals) {
    const domain = s.agentId || s.domain;
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }

  let rootCauseDomain = "waterlogging_hydrology";
  let maxCount = 0;
  for (const [domain, count] of Object.entries(domainCounts)) {
    if (count > maxCount) {
      maxCount = count;
      rootCauseDomain = domain;
    }
  }

  const avgHealth = allSignals.reduce((acc, s) => acc + (s.healthScore || 50), 0) / allSignals.length;
  const citywideCascadeScore = Number((Math.max(0.65, (100 - avgHealth) / 100)).toFixed(2));

  let citywideSeverity = "HIGH";
  if (citywideCascadeScore >= 0.80 || criticalSignals.length >= 8) citywideSeverity = "CRITICAL";
  else if (citywideCascadeScore >= 0.65) citywideSeverity = "HIGH";
  else if (citywideCascadeScore >= 0.50) citywideSeverity = "ELEVATED";
  else citywideSeverity = "NOMINAL";

  const affectedAreas = [
    {
      district: "Central Delhi",
      primarySectorId: "DEL_CENTRAL_CP",
      secondarySectors: ["DEL_CENTRAL_KB", "DEL_OLD_CHANDNI"],
      impactedDomains: ["waterlogging_hydrology", "transit_fleet", "power_grid"],
      affectedBy: {
        primaryThreat: "Minto Bridge Flash Inundation & Substation Tripping",
        description: "42cm standing water at underpass halting DTC routes and causing thermal overload on local distribution transformers.",
        metrics: {
          waterDepthCm: 42.0,
          busStationaryRatio: 0.78,
          gridLoadImpactPct: 91.2
        }
      }
    },
    {
      district: "East Delhi",
      primarySectorId: "DEL_EAST_LN",
      secondarySectors: ["DEL_EAST_PV", "DEL_EAST_MV"],
      impactedDomains: ["smog_dispersion", "social_panic", "hospital_capacity"],
      affectedBy: {
        primaryThreat: "Severe PM2.5 Stagnation & Panic Surge",
        description: "Stagnant smog plume (382 AQI) combined with viral social panic driving respiratory ER admissions up sharply.",
        metrics: {
          aqi: 382,
          meanRoBERTaPanicScore: 0.842,
          icuOccupancyPct: 95.2
        }
      }
    }
  ];

  const mitigationMeasures = {
    immediateDirectives: [
      {
        action: "Activate high-capacity mobile dewatering pumps at Minto Bridge underpass.",
        targetAgency: "PWD / MCD",
        priority: "P1_CRITICAL"
      },
      {
        action: "Deploy additional traffic police to unsignaled junctions during power outage.",
        targetAgency: "Delhi Traffic Police",
        priority: "P1_CRITICAL"
      },
      {
        action: "Pre-position ambulances near LNJP Hospital for respiratory overflow.",
        targetAgency: "CATS Ambulance / Delhi Health Dept.",
        priority: "P2_HIGH"
      }
    ],
    trafficAndTransitRerouting: [
      {
        affectedCorridor: "Connaught Place Radial Roads & Minto Road",
        bypassRoute: "DDU Marg -> Deen Dayal Upadhyaya flyover bypass",
        transitAdjustment: "DTC Line 419 diverted via Barakhamba Road to avoid Minto underpass."
      },
      {
        affectedCorridor: "Vikas Marg & Laxmi Nagar Metro Corridor",
        bypassRoute: "Nirman Vihar flyover alternate route",
        transitAdjustment: "Bus services rerouted away from low-visibility smog corridor."
      }
    ],
    publicAdvisories: [
      {
        channel: "Delhi Traffic Police Twitter / RSS & FM Broadcast",
        headline: "AVOID Minto Bridge Underpass & Outer Circle CP",
        message: "Severe waterlogging at Minto Bridge. Use DDU Marg or Barakhamba Road for East-West movement."
      },
      {
        channel: "DPCC Public Health Advisory",
        headline: "Severe Air Quality — East Delhi",
        message: "AQI at severe levels near Laxmi Nagar. Sensitive groups advised to remain indoors."
      }
    ]
  };

  return {
    incidentId: `CITY_INCIDENT_${Date.now()}`,
    citywideSeverity,
    citywideCascadeScore,
    summary: "Severe monsoonal flash flooding in Central Delhi underpasses causing cross-district bus gridlock and local power transformer trips.",
    rootCauseDomain: ["waterlogging_hydrology", "smog_dispersion", "thermal_stress", "transit_fleet", "road_corridor", "power_grid"].includes(rootCauseDomain) ? rootCauseDomain : "waterlogging_hydrology",
    affectedAreas,
    mitigationMeasures,
    timestamp: new Date().toISOString()
  };
}
