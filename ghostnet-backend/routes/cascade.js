// ─── GhostNet Cascade Routes ───

const express = require('express');
const router = express.Router();
const { store, setCascade, clearCascade, isCascadeCooldownActive } = require('../store/memory');
const { emitCascade, emitCascadeClear } = require('../socket/emitter');

/**
 * POST /cascade-alert
 * Receives a multi-agent consensus cascade alert.
 * Validates all fields with strict type checks.
 * 5-second debounce guard prevents duplicate cascade spam.
 * Overwrites any existing activeCascade (does not block).
 * Measures processing time to guarantee sub-1s emit.
 */
router.post('/cascade-alert', (req, res) => {
  const start = Date.now();

  try {
    const { confidence, predictedEvent, hoursUntil, recommendation, agentsTriggered, timestamp } = req.body;
    console.log('[CASCADE-ALERT] Received payload:', JSON.stringify(req.body));

    // ── Validate all fields with type checks ──
    if (
      typeof confidence !== 'number' || confidence < 0 || confidence > 100 ||
      typeof predictedEvent !== 'string' || !predictedEvent ||
      typeof hoursUntil !== 'number' ||
      typeof recommendation !== 'string' || !recommendation ||
      !Array.isArray(agentsTriggered) || agentsTriggered.length === 0 ||
      typeof timestamp !== 'string' || !timestamp
    ) {
      return res.status(400).json({ error: 'Invalid cascade payload' });
    }

    // ── Debounce guard: reject if another cascade was accepted <5s ago ──
    if (isCascadeCooldownActive()) {
      console.warn('[CASCADE] Duplicate cascade rejected — cooldown active');
      return res.status(429).json({ error: 'Cascade cooldown active, retry after 5s' });
    }

    // ── Log if overwriting an existing cascade ──
    if (store.activeCascade) {
      console.log('[CASCADE] Overwriting existing cascade');
    }

    // ── Strip to locked schema only ──
    const cascade = {
      confidence,
      predictedEvent,
      hoursUntil,
      recommendation,
      agentsTriggered,
      timestamp,
    };

    setCascade(cascade);
    emitCascade(cascade);

    console.log('[PERF] cascade-alert processed in', Date.now() - start, 'ms');

    return res.status(200).json({ status: 'cascade active', confidence: cascade.confidence });
  } catch (err) {
    console.error('[ERROR] POST /cascade-alert:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /cascade-clear
 * Clears the active cascade and notifies all frontends.
 * Idempotent — safe to call even if no cascade is active.
 */
router.post('/cascade-clear', (req, res) => {
  try {
    // ── Idempotent: no error if already null ──
    if (!store.activeCascade) {
      return res.status(200).json({ status: 'no active cascade to clear' });
    }

    const clearedCascade = clearCascade();
    emitCascadeClear();

    console.log('[CASCADE] Cleared cascade:', clearedCascade.predictedEvent);

    return res.status(200).json({
      status: 'cascade cleared',
      clearedEvent: clearedCascade.predictedEvent,
      clearedAt: clearedCascade.clearedAt,
    });
  } catch (err) {
    console.error('[ERROR] POST /cascade-clear:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cascade-history
 * Returns the complete audit trail of all past cascades.
 * Each entry includes clearedAt if the cascade was resolved.
 */
router.get('/cascade-history', (req, res) => {
  try {
    return res.status(200).json({
      count: store.cascadeHistory.length,
      history: store.cascadeHistory,
    });
  } catch (err) {
    console.error('[ERROR] GET /cascade-history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /test
 */
router.get('/test', (req, res) => {
  try {
    const lastCascade = store.cascadeHistory[store.cascadeHistory.length - 1];

    if (!lastCascade) {
      return res.status(404).json({ error: 'No cascade received yet. Hit /cascade-alert first.' });
    }

    setCascade(lastCascade);
    emitCascade(lastCascade);

    return res.status(200).json({ status: 'test cascade fired', payload: lastCascade });
  } catch (err) {
    console.error('[ERROR] GET /test:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
