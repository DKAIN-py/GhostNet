// ─── GhostNet In-Memory Store ───
// Single source of truth for all runtime data.
// No database — everything lives here and resets on restart.

const MAX_SIGNALS = 1440;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000;
const CASCADE_COOLDOWN = 5000; // 5 seconds debounce between cascades

const store = {
  signals: [],
  activeCascade: null,
  cascadeHistory: [],
  replayData: {},
};

// Tracks when the last cascade was accepted (epoch ms).
// Lives outside the store object — internal bookkeeping, not domain data.
let lastCascadeAt = 0;

/**
 * Check if a signal's timestamp is older than 25 hours.
 * The 1-hour grace (25h instead of 24h) absorbs minor clock skew between agents.
 * Returns true if stale → caller should reject with 400.
 */
function isSignalStale(signal) {
  const signalTime = new Date(signal.timestamp).getTime();
  const cutoff = Date.now() - TWENTY_FIVE_HOURS;
  if (signalTime < cutoff) {
    console.warn('[WARN] Stale signal rejected from', signal.agentId, signal.timestamp);
    return true;
  }
  return false;
}

/**
 * Push a signal and enforce dual caps:
 *  1. Time cap  — discard entries older than 24h
 *  2. Count cap — hard ceiling at 1440 entries (memory safety)
 *
 * Caller MUST check isSignalStale() before calling this.
 */
function addSignal(signal) {
  store.signals.push(signal);

  // Time-based prune: keep only last 24 hours
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);
  store.signals = store.signals.filter(
    (s) => new Date(s.timestamp) > cutoff
  );

  // Secondary safety cap: if signals still exceed 1440, keep the newest
  if (store.signals.length > MAX_SIGNALS) {
    store.signals = store.signals.slice(-MAX_SIGNALS);
  }
}

/**
 * Return signals within the last 24 hours.
 * Recomputes the time window fresh on every call — never cached.
 */
function getLast24hSignals() {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);
  return store.signals.filter((s) => new Date(s.timestamp) > cutoff);
}

/**
 * Check if a cascade was accepted too recently.
 * Returns true if within the 5-second cooldown window.
 */
function isCascadeCooldownActive() {
  return (Date.now() - lastCascadeAt) < CASCADE_COOLDOWN;
}

/**
 * Set the active cascade and archive it to history.
 * activeCascade is always overwritten (never stacked).
 * cascadeHistory has no cap — cascades are rare, keep all of them.
 * Updates lastCascadeAt for debounce tracking.
 */
function setCascade(cascade) {
  store.activeCascade = cascade;
  store.cascadeHistory.push(cascade);
  lastCascadeAt = Date.now();
}

/**
 * Clear the active cascade and return the object that was cleared.
 * Stamps clearedAt onto the history record so the audit trail shows
 * when each cascade was resolved.
 * Does NOT remove from cascadeHistory — past cascades are permanent record.
 * Returns the cleared cascade object (with clearedAt), or null if none was active.
 */
function clearCascade() {
  const cleared = store.activeCascade;
  if (cleared) {
    cleared.clearedAt = new Date().toISOString();
  }
  store.activeCascade = null;
  return cleared;
}

module.exports = {
  store, addSignal, getLast24hSignals, isSignalStale,
  setCascade, clearCascade, isCascadeCooldownActive,
};
