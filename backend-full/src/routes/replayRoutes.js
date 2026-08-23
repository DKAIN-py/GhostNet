import express from "express";
import { getSignals, getCascadeHistory } from "../store/memory.js";

export function createReplayRouter() {
  const router = express.Router();

  /**
   * GET /replay
   * Queries historical signals and cascades for playback
   */
  router.get("/replay", (req, res) => {
    const { date, limit } = req.query;
    const maxItems = parseInt(limit, 10) || 100;
    const allSignals = getSignals(maxItems);
    const cascades = getCascadeHistory(maxItems);

    let filteredSignals = allSignals;
    if (date) {
      filteredSignals = allSignals.filter((s) => s.timestamp && s.timestamp.startsWith(date));
    }

    return res.status(200).json({
      success: true,
      queryDate: date || "all",
      signalsCount: filteredSignals.length,
      signals: filteredSignals,
      cascades,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /replay/dates
   * Returns list of recorded signal dates
   */
  router.get("/replay/dates", (req, res) => {
    const allSignals = getSignals(500);
    const datesSet = new Set();

    for (const sig of allSignals) {
      if (sig.timestamp) {
        const d = sig.timestamp.split("T")[0];
        if (d) datesSet.add(d);
      }
    }

    if (datesSet.size === 0) {
      datesSet.add(new Date().toISOString().split("T")[0]);
    }

    return res.status(200).json({
      success: true,
      dates: Array.from(datesSet).sort().reverse(),
    });
  });

  return router;
}
