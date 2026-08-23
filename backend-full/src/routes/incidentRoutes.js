import express from "express";
import { setActiveCityIncident, clearActiveCityIncident, getActiveCityIncident } from "../store/memory.js";
import { validateCityIncident, validateCityIncidentClear } from "../agents/registry.js";
import { emitCityIncident, emitCityIncidentClear } from "../socket/emitter.js";

export function createIncidentRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * POST /city-incident & POST /city-cascade
   * Posts or updates a citywide aggregated incident, validates contract, stores and broadcasts via Socket.io
   */
  const handlePostCityIncident = (req, res) => {
    const incident = req.body;
    const validation = validateCityIncident(incident);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "City incident validation failed",
        details: validation.errors,
      });
    }

    setActiveCityIncident(incident);
    emitCityIncident(getIO(), incident);

    return res.status(200).json({
      success: true,
      message: "City incident recorded and broadcast successfully",
      incident,
      cityIncident: incident,
      data: incident,
    });
  };

  router.post("/city-incident", handlePostCityIncident);
  router.post("/city-cascade", handlePostCityIncident);

  /**
   * POST /city-incident-clear & POST /city-cascade-clear
   * Clears the active citywide incident, validates contract, stores and broadcasts via Socket.io
   */
  const handlePostCityIncidentClear = (req, res) => {
    const payload = req.body || {};
    const validation = validateCityIncidentClear(payload);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "City incident clear validation failed",
        details: validation.errors,
      });
    }

    const prev = getActiveCityIncident();
    const clearPayload = {
      incidentId: payload.incidentId || prev?.incidentId || `CITY_INCIDENT_CLR_${Date.now()}`,
      clearedAt: payload.clearedAt || payload.timestamp || new Date().toISOString(),
      resolutionSummary: payload.resolutionSummary || "City incident status resolved.",
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    clearActiveCityIncident(clearPayload);
    emitCityIncidentClear(getIO(), clearPayload);

    return res.status(200).json({
      success: true,
      message: "City incident cleared successfully",
      clearPayload,
    });
  };

  router.post("/city-incident-clear", handlePostCityIncidentClear);
  router.post("/city-cascade-clear", handlePostCityIncidentClear);

  /**
   * GET /city-incident & GET /city-cascade
   * Returns current active citywide incident
   */
  const handleGetCityIncident = (req, res) => {
    const incident = getActiveCityIncident();
    return res.status(200).json({
      success: true,
      incident,
      cityIncident: incident,
      data: incident,
      ...(incident || {}),
    });
  };

  router.get("/city-incident", handleGetCityIncident);
  router.get("/city-cascade", handleGetCityIncident);

  return router;
}
