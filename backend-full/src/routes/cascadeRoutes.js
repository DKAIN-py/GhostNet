import express from "express";
import { setActiveCascade, clearActiveCascade, getActiveCascades, getCascadeHistory } from "../store/memory.js";
import { validateCascadeAlert, normalizeCascadeAlert, validateCascadeClear } from "../agents/registry.js";
import { emitCascadeAlert, emitCascadeClear } from "../socket/emitter.js";

export function createCascadeRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * POST /cascade-alert
   * Receives cascade alert, validates contract, updates store, broadcasts unmodified via Socket.io
   */
  router.post("/cascade-alert", (req, res) => {
    const alert = normalizeCascadeAlert(req.body);
    const validation = validateCascadeAlert(alert);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "Cascade alert validation failed",
        details: validation.errors,
      });
    }

    setActiveCascade(alert);
    emitCascadeAlert(getIO(), alert);

    return res.status(200).json({
      success: true,
      message: "Cascade alert recorded and broadcast successfully",
      alert,
    });
  });

  /**
   * POST /cascade-clear
   * Clears a cascade alert for a sector, validates contract, updates store, broadcasts via Socket.io
   */
  router.post("/cascade-clear", (req, res) => {
    const payload = req.body || {};
    const validation = validateCascadeClear(payload);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "Cascade clear validation failed",
        details: validation.errors,
      });
    }

    const targetSector = payload.primarySectorId || payload.sectorId || "ALL";
    const clearPayload = {
      alertId: payload.alertId || `CLR_${Date.now()}`,
      primarySectorId: targetSector,
      clearedAt: payload.clearedAt || payload.timestamp || new Date().toISOString(),
      resolvedBy: payload.resolvedBy || "operator",
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    clearActiveCascade(targetSector, clearPayload);
    emitCascadeClear(getIO(), clearPayload);

    return res.status(200).json({
      success: true,
      message: "Cascade alert cleared successfully",
      clearPayload,
    });
  });

  /**
   * GET /cascades
   * Returns active cascades and history
   */
  router.get("/cascades", (req, res) => {
    return res.status(200).json({
      success: true,
      active: getActiveCascades(),
      history: getCascadeHistory(),
    });
  });

  return router;
}
