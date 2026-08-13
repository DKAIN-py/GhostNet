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
  CASCADE_WEIGHTS,
  CASCADE_THRESHOLD,
} from "../lib/schema";

import {
  SECTOR_IDS,
  SECTOR_BY_ID,
  distanceBetween,
  spatialDecay,
} from "../lib/sectors";


// ==============================================================
// SPATIAL CASCADE ENGINE
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
// STATE
// ==============================================================

const initialCascade = computeCascade(MOCK_SIGNALS) || MOCK_CASCADE;

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
  // CURRENT CASCADE
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
  // SOCKET
  // ==========================================================

  const {
    connected,
  } = useSocket(
    handleSignal,
    handleCascade,
    handleCascadeClear,
    handleAgentComms
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
  // falls back to recomputing the spatial decay engine against
  // whatever signals are currently in state, so the "fire demo
  // cascade" button works standalone, offline, in front of judges.
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
          "[GHOSTNET] /test failed, recomputing locally:",
          error
        );

        const currentSignals = Object.values(state.sectors).flatMap(
          (agents) => Object.values(agents || {})
        );

        const recomputed =
          computeCascade(currentSignals) ||
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

    pushMockSignal,

    recomputeCascade,

    sectors: state.sectors,

    agentComms: state.agentComms,

    allSignals,

    networkStats,

    sectorHealth,

  }), [

    state,

    connected,

    fireFakeCascade,

    clearCascade,

    pushMockSignal,

    recomputeCascade,

    allSignals,

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