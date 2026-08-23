import express from "express";
import { SECTORS, SECTOR_BY_ID } from "../lib/sectors.js";
import {
  sectors as sectorStore,
  activeCascades,
  getCascadeHistory,
  getSectorSignals
} from "../store/memory.js";

export function createStateRouter() {
  const router = express.Router();

  /**
   * GET /sectors/state
   * Returns current state map across all sectors including latest signals and active cascades
   */
  router.get("/sectors/state", (req, res) => {
    const states = SECTORS.map((sector) => {
      const sectorId = sector.sectorId;
      const signals = getSectorSignals(sectorId);
      const activeCascade = activeCascades.get(sectorId) || null;

      return {
        ...sector,
        signals,
        activeCascade,
      };
    });

    return res.status(200).json({
      success: true,
      count: states.length,
      sectors: states,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /sectors/state/:sectorId
   * Returns state for a specific sector
   */
  router.get("/sectors/state/:sectorId", (req, res) => {
    const { sectorId } = req.params;
    const sectorMeta = SECTOR_BY_ID[sectorId];

    if (!sectorMeta && !sectorStore.has(sectorId)) {
      return res.status(404).json({
        error: "NotFoundError",
        statusCode: 404,
        message: `Sector with ID '${sectorId}' not found`,
      });
    }

    const signals = getSectorSignals(sectorId);
    const activeCascade = activeCascades.get(sectorId) || null;

    return res.status(200).json({
      success: true,
      sectorId,
      metadata: sectorMeta || null,
      signals,
      activeCascade,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /history
   * Returns cascade history audit trail
   */
  router.get("/history", (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    return res.status(200).json({
      success: true,
      history: getCascadeHistory(limit),
    });
  });

  return router;
}
