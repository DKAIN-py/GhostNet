// ─── GhostNet Replay Routes ───

const express = require('express');
const router = express.Router();
const { getReplayDates, getReplaySignals } = require('../store/memory');
const { emitSignal, emitReplayComplete } = require('../socket/emitter');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Only these exact keys are accepted. Anything else defaults to "normal".
// Minimum interval enforced at 200ms — prevents event-loop flooding.
const SPEED_MAP = {
  slow: 2000,
  normal: 1000,
  fast: 500,
};

// Only one replay can run at a time.
// Stores { interval, date } when active, null when idle.
let activeReplay = null;

/**
 * Stop any currently running replay and clean up.
 * Optionally emits replay-complete with aborted flag.
 */
function stopActiveReplay(emitAbort = false) {
  if (activeReplay) {
    clearInterval(activeReplay.interval);
    console.log('[REPLAY] Stopping previous replay for', activeReplay.date);
    if (emitAbort) {
      emitReplayComplete(activeReplay.date, { aborted: true });
    }
    activeReplay = null;
  }
}

/**
 * GET /replay/dates
 * Returns sorted list of all available replay dates.
 * Always 200 — empty list is count: 0, never 404.
 */
router.get('/dates', (req, res) => {
  try {
    const dates = getReplayDates();
    return res.status(200).json({ count: dates.length, dates });
  } catch (err) {
    console.error('[ERROR] GET /replay/dates:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /replay/stop
 * Stops any currently running replay and emits replay-complete with aborted flag.
 * Idempotent — safe to call when no replay is active.
 */
router.get('/stop', (req, res) => {
  try {
    if (!activeReplay) {
      return res.status(200).json({ status: 'no active replay' });
    }

    const stoppedDate = activeReplay.date;
    stopActiveReplay(true); // emit aborted replay-complete

    return res.status(200).json({ status: 'replay stopped', date: stoppedDate });
  } catch (err) {
    console.error('[ERROR] GET /replay/stop:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /replay/stop
 * Same as GET /replay/stop — supports both verbs for flexibility.
 */
router.post('/stop', (req, res) => {
  try {
    if (!activeReplay) {
      return res.status(200).json({ status: 'no active replay' });
    }

    const stoppedDate = activeReplay.date;
    stopActiveReplay(true);

    return res.status(200).json({ status: 'replay stopped', date: stoppedDate });
  } catch (err) {
    console.error('[ERROR] POST /replay/stop:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /replay?date=YYYY-MM-DD&speed=normal
 * Starts streaming historical signals via Socket.io.
 * Returns immediately with metadata — signals arrive via "agent-signal" events.
 *
 * Validations:
 *  1. date must match YYYY-MM-DD regex
 *  2. date must be a valid calendar date (no Feb 31)
 *  3. date must not be in the future
 *  4. date must exist in replayData
 *  5. speed must be "slow" | "normal" | "fast" — anything else defaults to "normal"
 */
router.get('/', (req, res) => {
  try {
    const { date, speed } = req.query;

    // ── 1. Validate date format ──
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // ── 2. Validate calendar date (catches "2026-02-31", "9999-99-99") ──
    const parsed = new Date(date + 'T00:00:00Z');
    if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'Invalid calendar date' });
    }

    // ── 3. Reject future dates ──
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (parsed > today) {
      return res.status(400).json({ error: 'Cannot replay future date' });
    }

    // ── 4. Look up replay data for the date ──
    const signals = getReplaySignals(date);
    if (!signals) {
      return res.status(404).json({ error: 'No replay data for this date' });
    }

    // ── 5. Parse speed — only accept exact keys, default to normal ──
    const speedKey = SPEED_MAP[speed] ? speed : 'normal';
    const intervalMs = SPEED_MAP[speedKey];

    // ── Kill any existing replay before starting a new one ──
    stopActiveReplay(false); // no abort emit — we're replacing, not user-stopping

    // ── Start streaming ──
    let index = 0;

    const interval = setInterval(() => {
      if (index >= signals.length) {
        clearInterval(interval);
        activeReplay = null;
        emitReplayComplete(date);
        console.log('[REPLAY] Complete for', date, '— emitted', signals.length, 'signals');
        return;
      }

      emitSignal(signals[index]);
      index++;
      console.log('[REPLAY]', index + '/' + signals.length, 'for', date);
    }, intervalMs);

    activeReplay = { interval, date };

    console.log('[REPLAY] Started for', date, '| speed:', speedKey, '| signals:', signals.length);

    return res.status(200).json({
      status: 'replay started',
      date,
      speed: speedKey,
      totalSignals: signals.length,
    });
  } catch (err) {
    console.error('[ERROR] GET /replay:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
