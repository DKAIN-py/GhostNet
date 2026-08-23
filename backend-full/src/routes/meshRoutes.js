import express from "express";
import {
  getAllSectorSignals,
  getActiveCascades,
  getActiveCityIncident,
  getAgentComms,
  resetMemoryStore
} from "../store/memory.js";
import { SECTORS } from "../lib/sectors.js";
import { AGENT_META, ALL_AGENT_IDS } from "../lib/schema.js";

export function createMeshRouter() {
  const router = express.Router();

  /**
   * GET /health
   */
  router.get("/health", (req, res) => {
    return res.status(200).json({
      status: "nominal",
      service: "GHOSTNET backend relay service",
      activeSignalsCount: getAllSectorSignals().length,
      activeCascadesCount: getActiveCascades().length,
      hasActiveCityIncident: Boolean(getActiveCityIncident()),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /mesh/snapshot
   * Complete hydration payload for the React frontend
   */
  router.get("/mesh/snapshot", (req, res) => {
    return res.status(200).json({
      success: true,
      sectors: SECTORS,
      agents: AGENT_META,
      signals: getAllSectorSignals(),
      activeCascades: getActiveCascades(),
      activeCityIncident: getActiveCityIncident(),
      commsHistory: getAgentComms(30),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /sectors
   */
  router.get("/sectors", (req, res) => {
    return res.status(200).json({
      success: true,
      count: SECTORS.length,
      sectors: SECTORS,
    });
  });

  /**
   * GET /agents
   */
  router.get("/agents", (req, res) => {
    return res.status(200).json({
      success: true,
      agents: AGENT_META,
      agentIds: ALL_AGENT_IDS,
    });
  });

  /**
   * POST /mesh/reset
   */
  router.post("/mesh/reset", (req, res) => {
    resetMemoryStore();
    return res.status(200).json({
      success: true,
      message: "Memory store reset to clean state",
    });
  });

  return router;
}
