import express from "express";
import { addAgentComm, getAgentComms } from "../store/memory.js";
import { validateAgentComms } from "../agents/registry.js";
import { emitAgentComms } from "../socket/emitter.js";

export function createCommsRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * POST /agent-comms
   * Ingests inter-agent communication, validates contract, updates store, broadcasts unmodified via Socket.io
   */
  router.post("/agent-comms", (req, res) => {
    const comms = req.body;
    const validation = validateAgentComms(comms);

    if (!validation.valid) {
      return res.status(400).json({
        error: "ValidationError",
        statusCode: 400,
        message: "Agent comms validation failed",
        details: validation.errors,
      });
    }

    addAgentComm(comms);
    emitAgentComms(getIO(), comms);

    return res.status(200).json({
      success: true,
      message: "Agent comms broadcast successfully",
      comms,
    });
  });

  /**
   * GET /agent-comms
   * Retrieves recent agent communication history
   */
  router.get("/agent-comms", (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    return res.status(200).json({
      success: true,
      comms: getAgentComms(limit),
    });
  });

  return router;
}
