// ─── GhostNet Signal Routes ───

const express = require('express');
const router = express.Router();
const { addSignal, isSignalStale } = require('../store/memory');
const { emitSignal } = require('../socket/emitter');

const REQUIRED_FIELDS = [
  'agentId',
  'domain',
  'healthScore',
  'anomalyLevel',
  'signal',
];

const VALID_ANOMALY_LEVELS = ['good', 'moderate', 'critical', 'warning', 'nominal'];

/**
 * POST /agent-signal
 * Receives a signal from an AI agent, stores it, and broadcasts it.
 * - Strips unknown fields
 * - Validates healthScore range and anomalyLevel enum
 * - Defaults timestamp to server time if missing
 * - Rejects signals older than 25 hours
 */
router.post('/agent-signal', (req, res) => {
  try {
    // ── Required field check (timestamp excluded — it has a server-side default) ──
    const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── healthScore: must be a number 0–100 ──
    const hs = req.body.healthScore;
    if (typeof hs !== 'number' || hs < 0 || hs > 100) {
      return res.status(400).json({ error: 'healthScore must be a number between 0 and 100' });
    }

    // ── anomalyLevel: must be one of the allowed values ──
    if (!VALID_ANOMALY_LEVELS.includes(req.body.anomalyLevel)) {
      return res.status(400).json({
        error: `anomalyLevel must be one of: ${VALID_ANOMALY_LEVELS.join(', ')}`,
      });
    }

    // ── Strip to locked schema only (discard unknown fields) ──
    // ── Default timestamp to server time if missing ──
    const signal = {
      agentId: req.body.agentId,
      domain: req.body.domain,
      healthScore: req.body.healthScore,
      anomalyLevel: req.body.anomalyLevel,
      signal: req.body.signal,
      timestamp: req.body.timestamp || new Date().toISOString(),
    };

    // ── Stale timestamp guard: reject signals older than 25h ──
    if (isSignalStale(signal)) {
      return res.status(400).json({ error: 'Signal timestamp too old, rejected' });
    }

    addSignal(signal);
    emitSignal(signal);

    return res.status(200).json({ status: 'received', agentId: signal.agentId });
  } catch (err) {
    console.error('[ERROR] POST /agent-signal:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
