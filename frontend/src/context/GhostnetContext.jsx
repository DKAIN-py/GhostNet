import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

import { useSocket } from "../hooks/useSocket";

import {
  CASCADE_WEIGHTS,
  CASCADE_THRESHOLD,
  CITY_ROOT_CAUSE_DOMAINS,
} from "../lib/schema";

import {
  SECTOR_IDS,
  SECTOR_BY_ID,
  distanceBetween,
  spatialDecay,
} from "../lib/sectors";


// ==============================================================
// LOCATION JITTER (NEW)
//
// Root cause of the "multiple agents stacked in one perfect
// concentric ring" bug: whenever a signal's location was derived
// purely from its sector (no independent lat/lng of its own —
// e.g. the synthetic test-cascade signals below), every agent in
// that sector was given the EXACT same lat/lng (the sector
// centroid). On the map, each agent's zone visualization is
// centered on its own signal.location, sized by its own radius —
// so 4-6 agents all centered on one identical point render as
// perfectly concentric rings on top of each other.
//
// jitterSectorLocation() deterministically nudges each agent to a
// small, unique point around the sector centroid (same agentId
// always lands in the same spot, so re-firing a demo cascade
// doesn't jitter randomly between runs) so overlapping agents in
// the same sector fan out instead of stacking.
// ==============================================================

function hashStringToUnit(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000; // deterministic 0..1
}

function jitterSectorLocation(sector, agentId, radiusMeters = 220) {
  if (!sector || typeof sector.lat !== "number" || typeof sector.lng !== "number") {
    return sector ? { lat: sector.lat, lng: sector.lng } : null;
  }

  const unit = hashStringToUnit(agentId || "agent");
  const angle = unit * Math.PI * 2;

  const latOffset = (radiusMeters * Math.cos(angle)) / 111320;
  const lngOffset =
    (radiusMeters * Math.sin(angle)) /
    (111320 * Math.max(0.15, Math.abs(Math.cos((sector.lat * Math.PI) / 180))));

  return {
    lat: sector.lat + latOffset,
    lng: sector.lng + lngOffset,
  };
}


// ==============================================================
// SPATIAL CASCADE ENGINE (single strongest cascade — unchanged)
//
//   H(A→B) = R_A * e^(-lambda * distance(A,B))
//
// Every non-nominal signal is a source of risk that decays
// outward across the 39-sector mesh. Each sector's cascade
// score is the weighted sum of decayed risk arriving from every
// source signal (including itself, distance 0 = full weight).
// If any sector's score crosses CASCADE_THRESHOLD, that sector
// becomes the cascade's primary node and its highest-scoring
// neighbors become the "spatial spread."
//
// This is intentionally a pure function of `signals` so it can
// run identically against MOCK_SIGNALS, a live socket feed, or
// historical replay data without change.
// ==============================================================

function computeCascade(signals) {

  const sourceSignals = (signals || []).filter(
    (s) => s?.anomalyLevel && s.anomalyLevel !== "nominal"
  );

  if (sourceSignals.length === 0) {
    return null;
  }

  const scoreBySector = {};
  const contributionsBySector = {};

  SECTOR_IDS.forEach((id) => {
    scoreBySector[id] = 0;
  });

  sourceSignals.forEach((sig) => {

    const severity = 1 - Number(sig.healthScore ?? 50) / 100;
    const weight = CASCADE_WEIGHTS[sig.agentId] ?? 0;

    SECTOR_IDS.forEach((targetId) => {

      const distanceKm = distanceBetween(sig.sectorId, targetId);
      const decayed = spatialDecay(severity, distanceKm);
      const contribution = weight * decayed;

      scoreBySector[targetId] += contribution;

      if (contribution > 0.01) {
        if (!contributionsBySector[targetId]) {
          contributionsBySector[targetId] = [];
        }

        contributionsBySector[targetId].push({
          agentId: sig.agentId,
          sourceSectorId: sig.sectorId,
          contribution,
        });
      }

    });

  });

  let primarySectorId = null;
  let maxScore = 0;

  Object.entries(scoreBySector).forEach(([id, score]) => {
    if (score > maxScore) {
      maxScore = score;
      primarySectorId = id;
    }
  });

  if (!primarySectorId || maxScore < CASCADE_THRESHOLD) {
    return null;
  }

  const primarySector = SECTOR_BY_ID[primarySectorId];

  const spatialSpread = Object.entries(scoreBySector)
    .filter(([id, score]) => id !== primarySectorId && score >= maxScore * 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

  const triggeredAgents = [
    ...new Set(
      (contributionsBySector[primarySectorId] || [])
        .sort((a, b) => b.contribution - a.contribution)
        .map((c) => c.agentId)
    ),
  ];

  return {
    alertId: `ALT_LIVE_${Date.now()}`,

    primarySectorId,
    primarySectorName: primarySector?.name || primarySectorId,
    district: primarySector?.district || "UNKNOWN",

    cascadeScore: Number(maxScore.toFixed(3)),
    confidence: Math.round(Math.min(97, maxScore * 100 + 10)),

    predictedEvent: "Multi-domain cascade risk detected",
    hoursUntil: Math.max(1, Math.round(38 - maxScore * 20)),

    spatialSpread,
    triggeredAgents,

    recommendations: [
      "Deploy traffic police to affected corridors",
      "Issue public health / civic advisory",
      "Monitor downwind and downstream sectors for secondary effects",
    ],

    timestamp: new Date().toISOString(),
  };
}


// ==============================================================
// MULTI-CASCADE DETECTION (additive)
// ==============================================================

function computeCascades(signals, maxCascades = 39) {

  const sourceSignals = (signals || []).filter(
    (s) => s?.anomalyLevel && s.anomalyLevel !== "nominal"
  );

  if (sourceSignals.length === 0) return [];

  const scoreBySector = {};
  const contributionsBySector = {};

  SECTOR_IDS.forEach((id) => { scoreBySector[id] = 0; });

  sourceSignals.forEach((sig) => {
    const severity = 1 - Number(sig.healthScore ?? 50) / 100;
    const weight = CASCADE_WEIGHTS[sig.agentId] ?? 0;

    SECTOR_IDS.forEach((targetId) => {
      const distanceKm = distanceBetween(sig.sectorId, targetId);
      const decayed = spatialDecay(severity, distanceKm);
      const contribution = weight * decayed;

      scoreBySector[targetId] += contribution;

      if (contribution > 0.01) {
        if (!contributionsBySector[targetId]) contributionsBySector[targetId] = [];
        contributionsBySector[targetId].push({
          agentId: sig.agentId,
          sourceSectorId: sig.sectorId,
          contribution,
        });
      }
    });
  });

  const ranked = Object.entries(scoreBySector).sort((a, b) => b[1] - a[1]);
  const claimed = new Set();
  const cascades = [];

  for (const [sectorId, score] of ranked) {
    if (cascades.length >= maxCascades) break;
    if (score < CASCADE_THRESHOLD) break;
    if (claimed.has(sectorId)) continue;

    const primarySector = SECTOR_BY_ID[sectorId];

    const spatialSpread = ranked
      .filter(([id, s]) => id !== sectorId && !claimed.has(id) && s >= score * 0.3)
      .slice(0, 6)
      .map(([id]) => id);

    claimed.add(sectorId);
    spatialSpread.forEach((id) => claimed.add(id));

    const triggeredAgents = [
      ...new Set(
        (contributionsBySector[sectorId] || [])
          .sort((a, b) => b.contribution - a.contribution)
          .map((c) => c.agentId)
      ),
    ];

    cascades.push({
      alertId: `ALT_LIVE_${sectorId}_${Date.now()}`,
      primarySectorId: sectorId,
      primarySectorName: primarySector?.name || sectorId,
      district: primarySector?.district || "UNKNOWN",
      cascadeScore: Number(score.toFixed(3)),
      confidence: Math.round(Math.min(97, score * 100 + 10)),
      predictedEvent: "Multi-domain cascade risk detected",
      hoursUntil: Math.max(1, Math.round(38 - score * 20)),
      spatialSpread,
      triggeredAgents,
      recommendations: [
        "Deploy traffic police to affected corridors",
        "Issue public health / civic advisory",
        "Monitor downwind and downstream sectors for secondary effects",
      ],
      timestamp: new Date().toISOString(),
    });
  }

  return cascades;
}


// ==============================================================
// CITYWIDE INCIDENT AGGREGATION
//
// FIX: the previous version mapped cascades → affectedAreas 1:1,
// so a single active cascade (the common case) produced a
// citywide incident with exactly ONE affected area — visually and
// informationally indistinguishable from a plain sector cascade,
// even though "city cascade" is supposed to be the highest-level,
// richest view of the highest risk in the city.
//
// Cascades that land in the SAME DISTRICT almost always describe
// one real event rippling across nearby sectors (matches the
// schema's own worked example: flooding -> transit gridlock ->
// power trips, all in Central Delhi). So cascades are now grouped
// by district first: the strongest cascade in a district anchors
// the affected area, every other same-district cascade's primary
// sector gets folded into secondarySectors alongside its own
// spread, and impactedDomains / metrics are unioned across the
// whole group. Districts with only one cascade still benefit,
// since that cascade's own spatialSpread was already being
// computed but never fully surfaced.
//
// Output shape is unchanged from before (district, primarySectorId,
// secondarySectors, impactedDomains, affectedBy, ... per the
// citywide schema) — this only changes how areas are grouped and
// how much of the underlying cascade data each area carries.
// ==============================================================

function citySeverityFromScore(score) {
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.4) return "ELEVATED";
  return "NOMINAL";
}

function mitigationPriorityFromScore(score) {
  if (score >= 0.8) return "P1_CRITICAL";
  if (score >= 0.65) return "P2_HIGH";
  return "P3_MEDIUM";
}

function computeCityIncident(cascades, signals) {

  if (!cascades || cascades.length === 0) return null;

  const avgScore =
    cascades.reduce((sum, c) => sum + (c.cascadeScore || 0), 0) / cascades.length;
  const citywideCascadeScore = Number(Math.min(1, avgScore).toFixed(3));

  const domainCounts = {};
  cascades.forEach((c) => {
    (c.triggeredAgents || []).forEach((agentId) => {
      if (CITY_ROOT_CAUSE_DOMAINS.includes(agentId)) {
        domainCounts[agentId] = (domainCounts[agentId] || 0) + 1;
      }
    });
  });

  let rootCauseDomain = CITY_ROOT_CAUSE_DOMAINS[0];
  let bestCount = -1;
  CITY_ROOT_CAUSE_DOMAINS.forEach((domain) => {
    const count = domainCounts[domain] || 0;
    if (count > bestCount) {
      bestCount = count;
      rootCauseDomain = domain;
    }
  });

  // ---- group cascades by district ----------------------------
  const byDistrict = new Map();
  cascades.forEach((c) => {
    const key = c.district || "UNKNOWN";
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(c);
  });

  const enrichedAreas = [...byDistrict.entries()].map(([district, group]) => {
    const sorted = [...group].sort((a, b) => (b.cascadeScore || 0) - (a.cascadeScore || 0));
    const anchor = sorted[0];

    // every other same-district cascade's primary sector becomes a
    // spread node off the anchor, in addition to the anchor's own
    // spatialSpread
    const otherPrimaries = sorted.slice(1).map((c) => c.primarySectorId);
    const allSpread = sorted.flatMap((c) => c.spatialSpread || []);
    const secondarySectors = [
      ...new Set([...otherPrimaries, ...allSpread].filter((id) => id !== anchor.primarySectorId)),
    ];

    const impactedDomains = [
      ...new Set(sorted.flatMap((c) => c.triggeredAgents || [])),
    ];

    const sectorSignals = (signals || []).filter(
      (s) => s.sectorId === anchor.primarySectorId && impactedDomains.includes(s.agentId)
    );
    const worstSignal = sectorSignals.sort(
      (a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)
    )[0];

    // merge metrics from every cascade's worst signal in the district,
    // not just the anchor's, so the area reflects the whole district
    const mergedMetrics = sorted.reduce((acc, c) => {
      const cs = (signals || []).find(
        (s) => s.sectorId === c.primarySectorId && (c.triggeredAgents || []).includes(s.agentId)
      );
      return cs?.metrics ? { ...acc, ...cs.metrics } : acc;
    }, {});

    return {
      district,
      primarySectorId: anchor.primarySectorId,
      secondarySectors,
      impactedDomains,
      affectedBy: {
        primaryThreat: anchor.predictedEvent,
        description: worstSignal?.signal || anchor.predictedEvent,
        metrics: { ...mergedMetrics, ...(worstSignal?.metrics || {}) },
      },
      // internal-only, stripped before the payload is returned
      _cascadeScore: anchor.cascadeScore || 0,
      _recommendations: anchor.recommendations || [],
    };
  }).sort((a, b) => (b._cascadeScore || 0) - (a._cascadeScore || 0));

  const summary =
    enrichedAreas.length === 1
      ? `${enrichedAreas[0].affectedBy.primaryThreat} centered on ${SECTOR_BY_ID[enrichedAreas[0].primarySectorId]?.name || enrichedAreas[0].primarySectorId}, affecting ${enrichedAreas[0].secondarySectors.length} nearby sector${enrichedAreas[0].secondarySectors.length === 1 ? "" : "s"} across ${enrichedAreas[0].district}.`
      : `${enrichedAreas.length} districts under simultaneous cascade risk, led by "${enrichedAreas[0].affectedBy.primaryThreat}" in ${enrichedAreas[0].district}.`;

  const mitigationMeasures = {
    immediateDirectives: enrichedAreas.slice(0, 8).map((a) => ({
      action: a._recommendations?.[0] || "Deploy emergency response teams to affected sector.",
      targetAgency: "Delhi Traffic Police / PWD / MCD",
      priority: mitigationPriorityFromScore(a._cascadeScore || 0),
    })),
    trafficAndTransitRerouting: enrichedAreas.slice(0, 8).map((a) => ({
      affectedCorridor: SECTOR_BY_ID[a.primarySectorId]?.name || a.primarySectorId,
      bypassRoute: a.secondarySectors?.[0]
        ? `Route via ${SECTOR_BY_ID[a.secondarySectors[0]]?.name || a.secondarySectors[0]}`
        : "Alternate arterial route",
      transitAdjustment: a._recommendations?.[1] || "Reroute affected transit lines away from corridor.",
    })),
    publicAdvisories: enrichedAreas.slice(0, 6).map((a) => ({
      channel: "Delhi Traffic Police RSS / X Feed",
      headline: `AVOID ${SECTOR_BY_ID[a.primarySectorId]?.name || a.primarySectorId}`,
      message: a._recommendations?.[2] || a.affectedBy.primaryThreat,
    })),
  };

  // strip internal-only fields so the payload stays schema-clean
  const affectedAreas = enrichedAreas.map(
    ({ _cascadeScore, _recommendations, ...rest }) => rest
  );

  return {
    incidentId: `CITY_INCIDENT_${Date.now()}`,
    citywideSeverity: citySeverityFromScore(citywideCascadeScore),
    citywideCascadeScore,
    summary,
    affectedAreas,
    rootCauseDomain,
    mitigationMeasures,
    timestamp: new Date().toISOString(),
  };
}


// ==============================================================
// STATE
// ==============================================================

const initialState = {
  signals: {},
  sectors: {},
  feed: [],
  cascade: null,
  cascadeHistory: [],
  cityIncident: null,
  cityIncidentHistory: [],
  agentComms: [],
  acknowledgedCascadeIds: [],
  dataIntegrity: {
    status: "healthy",
    rejected: 0,
    latestIssue: null,
  },
  connected: false,
};


function reducer(state, action) {

  switch (action.type) {

    case "SIGNAL_RECEIVED": {

      const signal = action.payload;

      if (!signal || !signal.agentId) {
        console.warn("[GHOSTNET] Invalid agent signal:", signal);
        return state;
      }

      const sectorId = signal.sectorId || "UNKNOWN";

      return {
        ...state,

        signals: {
          ...state.signals,
          [signal.agentId]: signal,
        },

        sectors: {
          ...state.sectors,
          [sectorId]: {
            ...(state.sectors[sectorId] || {}),
            [signal.agentId]: signal,
          },
        },

        feed: [
          signal,
          ...state.feed.filter(
            (existing) =>
              !(existing.agentId === signal.agentId && existing.sectorId === signal.sectorId)
          ),
        ].slice(0, 50),

        // Recovery: any real, valid agent-signal arriving clears a
        // degraded integrity state. Guarded so a healthy state doesn't
        // get a new object reference on every single signal (avoids
        // needless re-renders in the common case).
        dataIntegrity:
          state.dataIntegrity.status === "healthy"
            ? state.dataIntegrity
            : { ...state.dataIntegrity, status: "healthy", latestIssue: null },
      };
    }

    case "CASCADE_FIRED": {
      const cascade = action.payload;
      if (!cascade) return state;

      return {
        ...state,
        cascade,
        cascadeHistory: [cascade, ...state.cascadeHistory].slice(0, 50),
      };
    }

    case "CASCADE_CLEARED":
      return { ...state, cascade: null };

    case "CITY_INCIDENT_FIRED": {
      const cityIncident = action.payload;
      if (!cityIncident) return state;

      return {
        ...state,
        cityIncident,
        cityIncidentHistory: [cityIncident, ...state.cityIncidentHistory].slice(0, 50),
      };
    }

    case "CITY_INCIDENT_CLEARED":
      return { ...state, cityIncident: null };

      case "DATA_INTEGRITY_RECEIVED": {
        const payload = action.payload;
        if (!payload) return state;
  
        return {
          ...state,
          dataIntegrity: {
            status: payload.status || "degraded",
            rejected: state.dataIntegrity.rejected + 1,
            latestIssue: {
              agentId: payload.agentId ?? null,
              sectorId: payload.sectorId ?? null,
              reason: payload.reason ?? "Signal failed validation.",
              timestamp: new Date().toISOString(),
            },
          },
        };
      }
    
    case "ACKNOWLEDGE_CASCADE": {
      const sectorId = action.payload;
      if (!sectorId || state.acknowledgedCascadeIds.includes(sectorId)) return state;

      return {
        ...state,
        acknowledgedCascadeIds: [...state.acknowledgedCascadeIds, sectorId],
      };
    }

    // ========================================================
    // UNACKNOWLEDGE CASCADES
    //
    // Explicitly removes the given sector ids from
    // acknowledgedCascadeIds. Used by fireFakeCascade /
    // fireFakeCityIncident right after seeding demo signals, so a
    // fresh test fire is never silently swallowed by a stale
    // acknowledgment on the same sector. Distinct from
    // PRUNE_ACKNOWLEDGED_CASCADES below (which fires automatically
    // when a cascade genuinely clears) — this one is dispatched
    // deliberately as part of "firing a new one."
    // ========================================================

    case "UNACKNOWLEDGE_CASCADES": {
      const idsToClear = action.payload || [];
      if (idsToClear.length === 0) return state;

      return {
        ...state,
        acknowledgedCascadeIds: state.acknowledgedCascadeIds.filter(
          (id) => !idsToClear.includes(id)
        ),
      };
    }

    case "PRUNE_ACKNOWLEDGED_CASCADES": {
      const staleIds = action.payload || [];
      if (staleIds.length === 0) return state;

      return {
        ...state,
        acknowledgedCascadeIds: state.acknowledgedCascadeIds.filter(
          (id) => !staleIds.includes(id)
        ),
      };
    }

    case "AGENT_COMMS_RECEIVED":
      if (!action.payload) return state;

      return {
        ...state,
        agentComms: [action.payload, ...state.agentComms].slice(0, 100),
      };

    case "SET_CONNECTED":
      return { ...state, connected: action.payload };

    default:
      return state;
  }
}


const GhostnetContext = createContext(null);


export function GhostnetProvider({ children }) {

  const [state, dispatch] = useReducer(reducer, initialState);

  const handleSignal = useCallback((signal) => {
    dispatch({ type: "SIGNAL_RECEIVED", payload: signal });
  }, []);

  const handleCascade = useCallback((cascade) => {
    dispatch({ type: "CASCADE_FIRED", payload: cascade });
  }, []);

  const handleCascadeClear = useCallback(() => {
    dispatch({ type: "CASCADE_CLEARED" });
  }, []);

  const handleAgentComms = useCallback((data) => {
    dispatch({ type: "AGENT_COMMS_RECEIVED", payload: data });
  }, []);

  const handleCityIncident = useCallback((cityIncident) => {
    dispatch({ type: "CITY_INCIDENT_FIRED", payload: cityIncident });
  }, []);

  const handleCityIncidentClear = useCallback(() => {
    dispatch({ type: "CITY_INCIDENT_CLEARED" });
  }, []);
  const handleDataIntegrity = useCallback((data) => {
    dispatch({ type: "DATA_INTEGRITY_RECEIVED", payload: data });
  }, []);

  const { connected } = useSocket(
    handleSignal,
    handleCascade,
    handleCascadeClear,
    handleAgentComms,
    handleCityIncident,
    handleCityIncidentClear,
    handleDataIntegrity
  );

  useEffect(() => {
    if (state.connected !== connected) {
      dispatch({ type: "SET_CONNECTED", payload: connected });
    }
  }, [connected, state.connected]);


  // ==========================================================
  // DEMO CASCADE
  //
  // FIX 1 (acknowledgment): previously, if the seeded sectors
  // (DEL_EAST_LN / DEL_EAST_PV) had ever been acknowledged via
  // SectorCascadePanel, they'd stay filtered out of `cascades`
  // forever — the acknowledgment only clears once a sector's
  // cascade genuinely disappears from rawCascades, but re-firing
  // the SAME sector every time means it never disappears, so it
  // never un-acknowledges either. Now explicitly dispatches
  // UNACKNOWLEDGE_CASCADES for the exact sectors it just seeded.
  //
  // FIX 2 (overlap, NEW): every seeded agent in the same sector
  // used to get the identical sector-centroid lat/lng, so their
  // zone visualizations rendered as perfectly stacked concentric
  // rings on the map. Each agent now gets a small deterministic
  // jitter via jitterSectorLocation() so they fan out around the
  // sector instead of sitting exactly on top of one another.
  // ==========================================================

  const fireFakeCascade = useCallback(async () => {
    try {
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:3001";
      const response = await fetch(`${backendUrl}/test`);

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      const payload = data?.payload;

      if (!payload) {
        throw new Error("Backend returned no cascade payload");
      }

      const backendSectorIds = [
        payload.primarySectorId,
        ...(payload.spatialSpread || []),
      ].filter(Boolean);

      if (backendSectorIds.length > 0) {
        dispatch({
          type: "UNACKNOWLEDGE_CASCADES",
          payload: backendSectorIds,
        });
      }

      dispatch({
        type: "CASCADE_FIRED",
        payload,
      });
    } catch (error) {
      console.error("[GHOSTNET] Backend /test failed:", error);
    }
  }, []);


  const clearCascade = useCallback(() => {
    dispatch({ type: "CASCADE_CLEARED" });
  }, []);


  // ==========================================================
  // DEMO CITY INCIDENT
  //
  // Same fix applied here: un-suppress every affectedAreas sector
  // (primary + secondaries) right after firing, so a re-fired demo
  // city incident is never hidden by a stale acknowledgment either.
  // ==========================================================

  const fireFakeCityIncident = useCallback(async () => {
    try {
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:3001";
      const response = await fetch(
        `${backendUrl}/test-city-incident`
      );

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      const payload = data?.payload;

      if (!payload) {
        throw new Error(
          "Backend returned no city incident payload"
        );
      }

      const backendSectorIds =
        (payload.affectedAreas || [])
          .flatMap((area) => [
            area.primarySectorId,
            ...(area.secondarySectors || []),
          ])
          .filter(Boolean);

      if (backendSectorIds.length > 0) {
        dispatch({
          type: "UNACKNOWLEDGE_CASCADES",
          payload: backendSectorIds,
        });
      }

      dispatch({
        type: "CITY_INCIDENT_FIRED",
        payload,
      });
    } catch (error) {
      console.error(
        "[GHOSTNET] Backend /test-city-incident failed:",
        error
      );
    }
  }, []);


  const clearCityIncident = useCallback(() => {
    dispatch({ type: "CITY_INCIDENT_CLEARED" });
  }, []);


  const acknowledgeCascade = useCallback((sectorId) => {
    if (!sectorId) return;
    dispatch({ type: "ACKNOWLEDGE_CASCADE", payload: sectorId });
  }, []);


  const pushMockSignal = useCallback(() => {
    // Compatibility no-op: frontend mock signals are disabled.
  }, []);


  const recomputeCascade = useCallback(() => {
    const currentSignals = Object.values(state.sectors).flatMap((agents) => Object.values(agents || {}));
    const next = computeCascade(currentSignals);

    dispatch({
      type: next ? "CASCADE_FIRED" : "CASCADE_CLEARED",
      payload: next,
    });
  }, [state.sectors]);


  const allSignals = useMemo(() => {
    const output = [];
    const seen = new Set();

    Object.entries(state.sectors).forEach(([sectorId, agents]) => {
      Object.values(agents || {}).forEach((signal) => {
        if (!signal) return;
        const key = `${sectorId}:${signal.agentId}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({ ...signal, sectorId: signal.sectorId || sectorId });
      });
    });

    return output;
  }, [state.sectors]);


  const rawCascades = useMemo(
    () => computeCascades(allSignals, 39),
    [allSignals]
  );

  const cascades = useMemo(
    () => rawCascades.filter((c) => !state.acknowledgedCascadeIds.includes(c.primarySectorId)),
    [rawCascades, state.acknowledgedCascadeIds]
  );

  useEffect(() => {
    const activeIds = new Set(rawCascades.map((c) => c.primarySectorId));
    const stale = state.acknowledgedCascadeIds.filter((id) => !activeIds.has(id));

    if (stale.length > 0) {
      dispatch({ type: "PRUNE_ACKNOWLEDGED_CASCADES", payload: stale });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCascades]);


  // Citywide incidents are backend-owned.
  // Do NOT derive a city incident from frontend sector cascades/signals.
  // The backend sends CITY_INCIDENT through useSocket, which is stored in
  // state.cityIncident by the reducer. When the backend sends nothing,
  // this remains null and the City Cascade layer stays empty.
  const liveCityIncident = state.cityIncident;


  const networkStats = useMemo(() => {
    if (allSignals.length === 0) {
      return {
        signalCount: 0,
        criticalCount: 0,
        warningCount: 0,
        nominalCount: 0,
        liveAnchorCount: 0,
        avgHealthScore: 0,
        weightedRiskScore: 0,
      };
    }

    let criticalCount = 0;
    let warningCount = 0;
    let nominalCount = 0;
    let liveAnchorCount = 0;
    let healthSum = 0;
    let weightedRisk = 0;

    allSignals.forEach((signal) => {
      if (signal.anomalyLevel === "critical") {
        criticalCount += 1;
      } else if (signal.anomalyLevel === "warning" || signal.anomalyLevel === "moderate") {
        warningCount += 1;
      } else {
        nominalCount += 1;
      }

      if (signal.isLiveAnchor) liveAnchorCount += 1;

      healthSum += Number(signal.healthScore ?? 0);

      const weight = CASCADE_WEIGHTS[signal.agentId] ?? 0;
      const severity = 1 - Number(signal.healthScore ?? 50) / 100;
      weightedRisk += weight * severity;
    });

    return {
      signalCount: allSignals.length,
      criticalCount,
      warningCount,
      nominalCount,
      liveAnchorCount,
      avgHealthScore: Math.round(healthSum / allSignals.length),
      weightedRiskScore: Number(weightedRisk.toFixed(3)),
    };
  }, [allSignals]);


  const sectorHealth = useMemo(() => {
    const output = {};

    Object.entries(state.sectors).forEach(([sectorId, agents]) => {
      const list = Object.values(agents || {}).filter(Boolean);
      if (list.length === 0) return;

      output[sectorId] = {
        district: list[0]?.district || "UNKNOWN",
        agentIds: list.map((s) => s.agentId),
        minHealthScore: Math.min(...list.map((s) => Number(s.healthScore ?? 100))),
        criticalCount: list.filter((s) => s.anomalyLevel === "critical").length,
        warningCount: list.filter((s) => s.anomalyLevel === "warning").length,
      };
    });

    return output;
  }, [state.sectors]);


  const value = useMemo(() => ({
    ...state,
    connected,
    fireFakeCascade,
    clearCascade,
    fireFakeCityIncident,
    clearCityIncident,
    acknowledgeCascade,
    pushMockSignal,
    recomputeCascade,
    sectors: state.sectors,
    agentComms: state.agentComms,
    allSignals,
    cascades,
    liveCityIncident,
    networkStats,
    sectorHealth,
  }), [
    state,
    connected,
    fireFakeCascade,
    clearCascade,
    fireFakeCityIncident,
    clearCityIncident,
    acknowledgeCascade,
    pushMockSignal,
    recomputeCascade,
    allSignals,
    cascades,
    liveCityIncident,
    networkStats,
    sectorHealth,
  ]);


  return (
    <GhostnetContext.Provider value={value}>
      {children}
    </GhostnetContext.Provider>
  );
}


// eslint-disable-next-line react-refresh/only-export-components
export function useGhostnet() {
  const context = useContext(GhostnetContext);

  if (!context) {
    throw new Error("useGhostnet must be used inside GhostnetProvider");
  }

  return context;
}