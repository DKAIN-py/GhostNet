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
  MOCK_SIGNALS,
  MOCK_CASCADE,
  MOCK_CITY_INCIDENT,
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
//
// computeCascade() above only ever returns the single strongest
// cascade citywide — with 39 independent sectors that's wrong the
// moment two unrelated crises are happening at once (a flood in the
// west, a smog cascade in the east). computeCascades() finds every
// sector that clears CASCADE_THRESHOLD, claims it plus its spread,
// then keeps scanning whatever sectors remain unclaimed — so
// multiple simultaneous, non-overlapping cascades can coexist.
//
// maxCascades default is 39 — per requirements, all 39 sectors can
// theoretically be independent cascade origins at once. Backend
// will send per-sector cascade-alert events for up to 39 concurrent
// sector cascades; this local engine mirrors that same ceiling so
// the mock/offline path behaves consistently with the real one.
//
// Deliberately does NOT touch state.cascade / state.cascadeHistory —
// this is a separate, purely-derived value (same pattern as
// networkStats / sectorHealth / allSignals below), so every existing
// component reading `cascade` (singular) keeps behaving exactly as
// before, off the single strongest one.
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
    if (score < CASCADE_THRESHOLD) break; // sorted desc — nothing further qualifies
    if (claimed.has(sectorId)) continue;  // already absorbed into a stronger cascade's spread

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
// CITYWIDE INCIDENT AGGREGATION (NEW, additive)
//
// Builds an object matching the "AutoNet Citywide Multi-Agent
// Cascade Aggregation" schema (incidentId, citywideSeverity,
// citywideCascadeScore, summary, affectedAreas, rootCauseDomain,
// mitigationMeasures, timestamp) purely from the current set of
// per-sector cascades — this is what lets the second dashboard
// ("City Cascade") work fully offline against mock data, with the
// exact same shape the real backend will eventually push over the
// city-incident socket event every ~30 minutes.
//
// Pure function of (cascades, signals) — same pattern as
// computeCascade/computeCascades above, so it can run identically
// against locally-computed cascades, a live socket feed, or replay
// data.
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

  // Citywide score: mean of all active sector cascade scores, capped at 1.
  const avgScore =
    cascades.reduce((sum, c) => sum + (c.cascadeScore || 0), 0) / cascades.length;
  const citywideCascadeScore = Number(Math.min(1, avgScore).toFixed(3));

  // rootCauseDomain must be one of the schema's restricted enum — pick
  // whichever of those six domains appears most often across all active
  // cascades' triggeredAgents.
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

  // affectedAreas — one entry per active sector cascade.
  const affectedAreas = cascades.map((c) => {
    const sectorSignals = (signals || []).filter(
      (s) => s.sectorId === c.primarySectorId && (c.triggeredAgents || []).includes(s.agentId)
    );
    const worstSignal = sectorSignals.sort(
      (a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)
    )[0];

    return {
      district: c.district,
      primarySectorId: c.primarySectorId,
      secondarySectors: c.spatialSpread || [],
      impactedDomains: c.triggeredAgents || [],
      affectedBy: {
        primaryThreat: c.predictedEvent,
        description: worstSignal?.signal || c.predictedEvent,
        metrics: worstSignal?.metrics || {},
      },
    };
  });

  const summary =
    cascades.length === 1
      ? `${cascades[0].predictedEvent} centered on ${cascades[0].primarySectorName || cascades[0].primarySectorId}, affecting ${cascades[0].spatialSpread?.length || 0} nearby sector${(cascades[0].spatialSpread?.length || 0) === 1 ? "" : "s"}.`
      : `${cascades.length} simultaneous cascade events across the city, led by "${cascades[0].predictedEvent}" in ${cascades[0].primarySectorName || cascades[0].primarySectorId}.`;

  const mitigationMeasures = {
    immediateDirectives: cascades.slice(0, 6).map((c) => ({
      action: c.recommendations?.[0] || "Deploy emergency response teams to affected sector.",
      targetAgency: "Delhi Traffic Police / PWD / MCD",
      priority: mitigationPriorityFromScore(c.cascadeScore || 0),
    })),
    trafficAndTransitRerouting: cascades.slice(0, 6).map((c) => ({
      affectedCorridor: c.primarySectorName || c.primarySectorId,
      bypassRoute: c.spatialSpread?.[0]
        ? `Route via ${SECTOR_BY_ID[c.spatialSpread[0]]?.name || c.spatialSpread[0]}`
        : "Alternate arterial route",
      transitAdjustment: c.recommendations?.[1] || "Reroute affected transit lines away from corridor.",
    })),
    publicAdvisories: cascades.slice(0, 4).map((c) => ({
      channel: "Delhi Traffic Police RSS / X Feed",
      headline: `AVOID ${c.primarySectorName || c.primarySectorId}`,
      message: c.recommendations?.[2] || c.predictedEvent,
    })),
  };

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

const initialCascade = computeCascade(MOCK_SIGNALS) || MOCK_CASCADE;
const initialCascadesList = computeCascades(MOCK_SIGNALS, 39);
const initialCityIncident = computeCityIncident(initialCascadesList, MOCK_SIGNALS) || null;

const initialState = {

  // ----------------------------------------------------------
  // FLAT SIGNAL INDEX
  //
  // Existing components can still do:
  //
  // signals[agentId]
  //
  // NOTE: with 39 sectors this only keeps the *last-written*
  // signal per agentId across all sectors — kept for backward
  // compatibility, but prefer `sectors` / `allSignals` for
  // anything sector-aware.
  // ----------------------------------------------------------

  signals: MOCK_SIGNALS.reduce((acc, signal) => {
    acc[signal.agentId] = signal;
    return acc;
  }, {}),


  // ----------------------------------------------------------
  // SECTOR → AGENT TOPOLOGY
  //
  // sectors[sectorId][agentId]
  //
  // Example:
  //
  // sectors["DEL_EAST_LN"]["smog_dispersion"]
  //
  // ----------------------------------------------------------

  sectors: MOCK_SIGNALS.reduce((acc, signal) => {

    const sectorId = signal.sectorId || "UNKNOWN";

    if (!acc[sectorId]) {
      acc[sectorId] = {};
    }

    acc[sectorId][signal.agentId] = signal;

    return acc;

  }, {}),


  // ----------------------------------------------------------
  // LATEST SIGNAL FEED
  // ----------------------------------------------------------

  feed: [...MOCK_SIGNALS].reverse().slice(0, 50),


  // ----------------------------------------------------------
  // CURRENT CASCADE (singular — unchanged)
  //
  // Computed live from MOCK_SIGNALS via the spatial decay
  // engine on load, so the map opens already mid-cascade
  // instead of waiting for a manual trigger.
  // ----------------------------------------------------------

  cascade: initialCascade,


  // ----------------------------------------------------------
  // CASCADE HISTORY
  // ----------------------------------------------------------

  cascadeHistory: initialCascade ? [initialCascade] : [],


  // ----------------------------------------------------------
  // CITY INCIDENT (NEW — singular, backend/manual-driven)
  //
  // Distinct from the per-sector `cascade` above. Represents the
  // citywide aggregated incident per the AutoNet Citywide schema.
  // Populated either by a real backend `city-incident` socket
  // event (~every 30 min), or by fireFakeCityIncident() for
  // testing against mock data. Seeded at load from the initial
  // mock cascades so the City Cascade dashboard isn't empty on
  // first render.
  // ----------------------------------------------------------

  cityIncident: initialCityIncident,


  // ----------------------------------------------------------
  // CITY INCIDENT HISTORY (NEW)
  // ----------------------------------------------------------

  cityIncidentHistory: initialCityIncident ? [initialCityIncident] : [],


  // ----------------------------------------------------------
  // AGENT → AGENT COMMUNICATION
  // ----------------------------------------------------------

  agentComms: [],


  // ----------------------------------------------------------
  // SOCKET STATUS
  // ----------------------------------------------------------

  connected: false,
};


function reducer(state, action) {

  switch (action.type) {


    // ========================================================
    // SIGNAL RECEIVED
    // ========================================================

    case "SIGNAL_RECEIVED": {

      const signal = action.payload;

      if (!signal || !signal.agentId) {
        console.warn(
          "[GHOSTNET] Invalid agent signal:",
          signal
        );

        return state;
      }

      const sectorId =
        signal.sectorId || "UNKNOWN";


      return {

        ...state,


        // ----------------------------------------------------
        // Flat index
        // ----------------------------------------------------

        signals: {
          ...state.signals,
          [signal.agentId]: signal,
        },


        // ----------------------------------------------------
        // Sector topology
        // ----------------------------------------------------

        sectors: {

          ...state.sectors,

          [sectorId]: {

            ...(state.sectors[sectorId] || {}),

            [signal.agentId]: signal,

          },

        },


        // ----------------------------------------------------
        // Feed
        //
        // Replace previous signal from same agent + sector.
        // ----------------------------------------------------

        feed: [

          signal,

          ...state.feed.filter(
            (existing) =>
              !(
                existing.agentId === signal.agentId &&
                existing.sectorId === signal.sectorId
              )
          ),

        ].slice(0, 50),

      };
    }


    // ========================================================
    // CASCADE FIRED
    // ========================================================

    case "CASCADE_FIRED": {

      const cascade = action.payload;

      if (!cascade) {
        return state;
      }

      return {

        ...state,

        cascade,

        cascadeHistory: [
          cascade,
          ...state.cascadeHistory,
        ].slice(0, 50),

      };
    }


    // ========================================================
    // CASCADE CLEARED
    // ========================================================

    case "CASCADE_CLEARED":

      return {
        ...state,
        cascade: null,
      };


    // ========================================================
    // CITY INCIDENT FIRED (NEW)
    // ========================================================

    case "CITY_INCIDENT_FIRED": {

      const cityIncident = action.payload;

      if (!cityIncident) {
        return state;
      }

      return {

        ...state,

        cityIncident,

        cityIncidentHistory: [
          cityIncident,
          ...state.cityIncidentHistory,
        ].slice(0, 50),

      };
    }


    // ========================================================
    // CITY INCIDENT CLEARED (NEW)
    // ========================================================

    case "CITY_INCIDENT_CLEARED":

      return {
        ...state,
        cityIncident: null,
      };


    // ========================================================
    // AGENT COMMUNICATION
    // ========================================================

    case "AGENT_COMMS_RECEIVED":

      if (!action.payload) {
        return state;
      }

      return {

        ...state,

        agentComms: [

          action.payload,

          ...state.agentComms,

        ].slice(0, 100),

      };


    // ========================================================
    // SOCKET CONNECTION
    // ========================================================

    case "SET_CONNECTED":

      return {

        ...state,

        connected: action.payload,

      };


    default:

      return state;
  }
}


const GhostnetContext =
  createContext(null);


export function GhostnetProvider({
  children,
}) {

  const [state, dispatch] =
    useReducer(
      reducer,
      initialState
    );


  // ==========================================================
  // SOCKET CALLBACKS
  // ==========================================================

  const handleSignal =
    useCallback((signal) => {

      dispatch({
        type: "SIGNAL_RECEIVED",
        payload: signal,
      });

    }, []);


  const handleCascade =
    useCallback((cascade) => {

      dispatch({
        type: "CASCADE_FIRED",
        payload: cascade,
      });

    }, []);


  const handleCascadeClear =
    useCallback(() => {

      dispatch({
        type: "CASCADE_CLEARED",
      });

    }, []);


  const handleAgentComms =
    useCallback((data) => {

      dispatch({
        type: "AGENT_COMMS_RECEIVED",
        payload: data,
      });

    }, []);


  // ==========================================================
  // CITY INCIDENT SOCKET CALLBACKS (NEW)
  // ==========================================================

  const handleCityIncident =
    useCallback((cityIncident) => {

      dispatch({
        type: "CITY_INCIDENT_FIRED",
        payload: cityIncident,
      });

    }, []);


  const handleCityIncidentClear =
    useCallback(() => {

      dispatch({
        type: "CITY_INCIDENT_CLEARED",
      });

    }, []);


  // ==========================================================
  // SOCKET
  // ==========================================================

  const {
    connected,
  } = useSocket(
    handleSignal,
    handleCascade,
    handleCascadeClear,
    handleAgentComms,
    handleCityIncident,
    handleCityIncidentClear
  );


  // ==========================================================
  // SYNC CONNECTION STATE
  // ==========================================================

  useEffect(() => {

    if (state.connected !== connected) {

      dispatch({
        type: "SET_CONNECTED",
        payload: connected,
      });

    }

  }, [
    connected,
    state.connected,
  ]);


  // ==========================================================
  // DEMO CASCADE
  //
  // Tries the backend /test endpoint first (real pipeline);
  // falls back to INJECTING real synthetic signals (not just a
  // floating cascade object) so the independently-derived
  // `cascades` array (used by NervousSystem's red edges/pulses)
  // actually has data to detect — previously this only wrote to
  // state.cascade, which computeCascades() never reads, so the
  // graph never lit up on a fake-fired cascade even though the
  // modal/bar/log did.
  // ==========================================================

  const fireFakeCascade =
    useCallback(async () => {

      try {

        const backendUrl =
          import.meta.env.VITE_BACKEND_URL ||
          "http://localhost:3001";


        const response =
          await fetch(
            `${backendUrl}/test`
          );


        if (!response.ok) {

          throw new Error(
            `Backend returned ${response.status}`
          );

        }


        const data =
          await response.json();


        dispatch({

          type: "CASCADE_FIRED",

          payload:
            data.payload,

        });

      } catch (error) {

        console.error(
          "[GHOSTNET] /test failed, injecting synthetic cascade signals:",
          error
        );

        // Seed a small, geographically-coherent cluster of real signals
        // (same shape SIGNAL_RECEIVED expects) so the spatial decay engine
        // — and therefore the separately-computed `cascades` array — can
        // actually pick it up, not just the singular `cascade` value.
        const seedSignals = [
          { sectorId: "DEL_EAST_LN", agentId: "smog_dispersion", healthScore: 20, anomalyLevel: "critical" },
          { sectorId: "DEL_EAST_LN", agentId: "social_panic",    healthScore: 22, anomalyLevel: "critical" },
          { sectorId: "DEL_EAST_PV", agentId: "smog_dispersion", healthScore: 45, anomalyLevel: "warning"  },
        ];

        seedSignals.forEach((partial) => {
          const sector = SECTOR_BY_ID[partial.sectorId];
          dispatch({
            type: "SIGNAL_RECEIVED",
            payload: {
              ...partial,
              district: sector?.district,
              isLiveAnchor: sector?.isLiveAnchor ?? false,
              location: {
                placeName: sector?.name,
                lat: sector?.lat,
                lng: sector?.lng,
                radiusMeters: 900,
              },
              signal: "Manually triggered test cascade signal.",
              metrics: {},
              timestamp: new Date().toISOString(),
            },
          });
        });

        const currentSignals = Object.values(state.sectors).flatMap(
          (agents) => Object.values(agents || {})
        );

        const recomputed =
          computeCascade([...currentSignals, ...seedSignals]) ||
          { ...MOCK_CASCADE, timestamp: new Date().toISOString() };

        dispatch({

          type: "CASCADE_FIRED",

          payload: recomputed,

        });

      }

    }, [state.sectors]);


  // ==========================================================
  // MANUAL CASCADE CLEAR
  // ==========================================================

  const clearCascade =
    useCallback(() => {

      dispatch({
        type: "CASCADE_CLEARED",
      });

    }, []);


  // ==========================================================
  // DEMO CITY INCIDENT (NEW)
  //
  // Same pattern as fireFakeCascade: tries a backend test
  // endpoint first, falls back to computing a real citywide
  // aggregation from whatever sector cascades currently exist
  // in state, and only reaches for the static MOCK_CITY_INCIDENT
  // if there are no active cascades to aggregate from at all.
  // ==========================================================

  const fireFakeCityIncident =
    useCallback(async () => {

      try {

        const backendUrl =
          import.meta.env.VITE_BACKEND_URL ||
          "http://localhost:3001";

        const response =
          await fetch(
            `${backendUrl}/test-city-incident`
          );

        if (!response.ok) {
          throw new Error(
            `Backend returned ${response.status}`
          );
        }

        const data = await response.json();

        dispatch({
          type: "CITY_INCIDENT_FIRED",
          payload: data.payload,
        });

      } catch (error) {

        console.error(
          "[GHOSTNET] /test-city-incident failed, computing locally:",
          error
        );

        const currentSignals = Object.values(state.sectors).flatMap(
          (agents) => Object.values(agents || {})
        );

        const currentCascades = computeCascades(currentSignals, 39);

        const computed =
          computeCityIncident(currentCascades, currentSignals) ||
          { ...MOCK_CITY_INCIDENT, timestamp: new Date().toISOString() };

        dispatch({
          type: "CITY_INCIDENT_FIRED",
          payload: computed,
        });

      }

    }, [state.sectors]);


  // ==========================================================
  // MANUAL CITY INCIDENT CLEAR (NEW)
  // ==========================================================

  const clearCityIncident =
    useCallback(() => {

      dispatch({
        type: "CITY_INCIDENT_CLEARED",
      });

    }, []);


  // ==========================================================
  // MANUAL MOCK SIGNAL
  //
  // Used by the Judge Demo Panel ("inject hazard at sector X")
  // — pushes a signal in, then the cascade recomputes on the
  // next `recomputeCascade()` call so judges see the ripple.
  // ==========================================================

  const pushMockSignal =
    useCallback((signal) => {

      dispatch({

        type: "SIGNAL_RECEIVED",

        payload: signal,

      });

    }, []);


  // ==========================================================
  // RECOMPUTE CASCADE
  //
  // Re-runs the spatial decay engine against current state and
  // fires (or clears) the cascade accordingly. Call this after
  // pushMockSignal() to make an injected hazard visibly ripple.
  // ==========================================================

  const recomputeCascade =
    useCallback(() => {

      const currentSignals = Object.values(state.sectors).flatMap(
        (agents) => Object.values(agents || {})
      );

      const next = computeCascade(currentSignals);

      dispatch({
        type: next ? "CASCADE_FIRED" : "CASCADE_CLEARED",
        payload: next,
      });

    }, [state.sectors]);


  // ==========================================================
  // DERIVED — flattened signal list
  //
  // Convenience array form of `sectors`, deduped by
  // sectorId+agentId, so consumers don't each reimplement
  // the sectors → array flatten that CityMap needs.
  // ==========================================================

  const allSignals = useMemo(() => {

    const output = [];
    const seen = new Set();

    Object.entries(state.sectors).forEach(
      ([sectorId, agents]) => {

        Object.values(agents || {}).forEach(
          (signal) => {

            if (!signal) return;

            const key = `${sectorId}:${signal.agentId}`;

            if (seen.has(key)) return;

            seen.add(key);

            output.push({
              ...signal,
              sectorId: signal.sectorId || sectorId,
            });

          }
        );

      }
    );

    return output;

  }, [state.sectors]);


  // ==========================================================
  // DERIVED — multiple simultaneous cascades (additive)
  //
  // Live-recomputed off allSignals directly — no manual trigger
  // needed, unlike the singular `cascade` above which only updates
  // when recomputeCascade()/fireFakeCascade() is explicitly called.
  // cascades[0] is always the strongest, same sector `computeCascade`
  // would have picked, so the two stay consistent with each other.
  //
  // Capped at 39 (all sectors), per the "up to 39 concurrent
  // per-sector cascades" requirement.
  // ==========================================================

  const cascades = useMemo(
    () => computeCascades(allSignals, 39),
    [allSignals]
  );


  // ==========================================================
  // DERIVED — live citywide incident (NEW)
  //
  // Auto-recomputed off `cascades` + `allSignals` directly, same
  // pattern as `cascades` above — no manual trigger needed. This
  // is what the "City Cascade" dashboard should read by default;
  // `cityIncident` (singular, in state) is for backend-pushed or
  // manually-fired incidents specifically, while this one always
  // reflects current reality even if nobody has fired anything.
  // ==========================================================

  const liveCityIncident = useMemo(
    () => computeCityIncident(cascades, allSignals),
    [cascades, allSignals]
  );


  // ==========================================================
  // DERIVED — network health stats
  //
  // Powers header/status widgets without every component
  // recomputing the same aggregates. With 468 signals live,
  // this is the number that actually matters at a glance.
  // ==========================================================

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
      } else if (
        signal.anomalyLevel === "warning" ||
        signal.anomalyLevel === "moderate"
      ) {
        warningCount += 1;
      } else {
        nominalCount += 1;
      }

      if (signal.isLiveAnchor) {
        liveAnchorCount += 1;
      }

      healthSum += Number(signal.healthScore ?? 0);

      const weight = CASCADE_WEIGHTS[signal.agentId] ?? 0;
      const severity =
        1 - Number(signal.healthScore ?? 50) / 100;

      weightedRisk += weight * severity;

    });

    return {
      signalCount: allSignals.length,
      criticalCount,
      warningCount,
      nominalCount,
      liveAnchorCount,
      avgHealthScore: Math.round(
        healthSum / allSignals.length
      ),
      weightedRiskScore: Number(
        weightedRisk.toFixed(3)
      ),
    };

  }, [allSignals]);


  // ==========================================================
  // DERIVED — per-sector rollup
  //
  // sectorHealth[sectorId] = { district, minHealthScore,
  //   criticalCount, agentIds }
  //
  // Powers a sector-level base layer (39 dots) so the map
  // isn't forced to render all 468 individual agent shapes.
  // ==========================================================

  const sectorHealth = useMemo(() => {

    const output = {};

    Object.entries(state.sectors).forEach(
      ([sectorId, agents]) => {

        const list = Object.values(agents || {}).filter(Boolean);

        if (list.length === 0) return;

        output[sectorId] = {
          district: list[0]?.district || "UNKNOWN",
          agentIds: list.map((s) => s.agentId),
          minHealthScore: Math.min(
            ...list.map((s) => Number(s.healthScore ?? 100))
          ),
          criticalCount: list.filter(
            (s) => s.anomalyLevel === "critical"
          ).length,
          warningCount: list.filter(
            (s) => s.anomalyLevel === "warning"
          ).length,
        };

      }
    );

    return output;

  }, [state.sectors]);


  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const value = useMemo(() => ({

    ...state,

    connected,

    fireFakeCascade,

    clearCascade,

    fireFakeCityIncident,

    clearCityIncident,

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

    pushMockSignal,

    recomputeCascade,

    allSignals,

    cascades,

    liveCityIncident,

    networkStats,

    sectorHealth,

  ]);


  return (

    <GhostnetContext.Provider
      value={value}
    >

      {children}

    </GhostnetContext.Provider>

  );
}


// eslint-disable-next-line react-refresh/only-export-components

export function useGhostnet() {

  const context =
    useContext(GhostnetContext);


  if (!context) {

    throw new Error(
      "useGhostnet must be used inside GhostnetProvider"
    );

  }


  return context;
}