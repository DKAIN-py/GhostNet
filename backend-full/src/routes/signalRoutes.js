import express from "express";
import { setSectorSignal, getAllSectorSignals, getSectorSignals } from "../store/memory.js";
import { validateAgentSignal } from "../agents/registry.js";
import { emitAgentSignal } from "../socket/emitter.js";

export function createSignalRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * POST /agent-signal
   * Receives telemetry from autonomous agents, validates contract, updates store, emits via Socket.io unmodified.
   */
  router.post("/agent-signal", (req, res) => {
    const signal = req.body;
    const validation = validateAgentSignal(signal);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "Agent signal validation failed",
        details: validation.errors,
      });
    }

    // Save to memory store
    setSectorSignal(signal);

    // Emit live signal unmodified to all connected Socket.io clients
    emitAgentSignal(getIO(), signal);

    return res.status(200).json({
      success: true,
      message: "Agent signal processed and broadcast successfully",
      signal,
    });
  });

  /**
   * GET /agent-signals
   * Fetches latest signals with optional ?sectorId= or ?agentId= filtering
   */
  router.get("/agent-signals", (req, res) => {
    const { sectorId, agentId } = req.query;
    let results = sectorId ? getSectorSignals(sectorId) : getAllSectorSignals();

    if (agentId) {
      results = results.filter((s) => s.agentId === agentId);
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      signals: results,
    });
  });

  return router;
}
