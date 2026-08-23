// ─── GhostNet History Routes ───

const express = require('express');
const router = express.Router();
const { getLast24hSignals } = require('../store/memory');

// ─── In-Memory Rate Limiter ───
// Max 30 requests per minute per IP. No external packages.
// The requestCounts object maps IP → { count, resetAt }.
// Stale entries are cleaned up lazily on each request.
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000; // 1 minute in ms
const requestCounts = {};

function rateLimiter(req, res, next) {
  const ip = req.ip;
  const now = Date.now();

  // Initialize or reset if the window has expired
  if (!requestCounts[ip] || now > requestCounts[ip].resetAt) {
    requestCounts[ip] = { count: 0, resetAt: now + RATE_WINDOW };
  }

  requestCounts[ip].count++;

  if (requestCounts[ip].count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}

/**
 * GET /history
 * Returns all signals from the last 24 hours.
 * Rate limited: 30 requests per minute per IP.
 * Always returns 200 — empty history is count: 0 with an empty array, never 404.
 */
router.get('/', rateLimiter, (req, res) => {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const signals = getLast24hSignals();

    return res.status(200).json({
      count: signals.length,
      from: from.toISOString(),
      to: now.toISOString(),
      signals,
    });
  } catch (err) {
    console.error('[ERROR] GET /history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
