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

// ─── Replay Helpers ───

/**
 * Seed store.replayData with mock historical signals for dev/demo.
 * Each date gets signals from all 3 agent domains at varying health levels.
 * Called once at server startup.
 */
function seedReplayData() {
  store.replayData['2026-06-10'] = [
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 82, anomalyLevel: 'good', signal: 'AQI stable at 78 across Delhi NCR', timestamp: '2026-06-10T06:00:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 75, anomalyLevel: 'good', signal: 'Metro services running on schedule', timestamp: '2026-06-10T06:15:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 88, anomalyLevel: 'good', signal: 'Public sentiment neutral — no trending alerts', timestamp: '2026-06-10T06:30:00Z' },
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 61, anomalyLevel: 'moderate', signal: 'PM2.5 rising in Anand Vihar — 142 µg/m³', timestamp: '2026-06-10T09:00:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 52, anomalyLevel: 'moderate', signal: 'Congestion building on NH-24 corridor', timestamp: '2026-06-10T09:30:00Z' },
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 28, anomalyLevel: 'critical', signal: 'AQI spike to 389 in South Delhi — stubble burning detected', timestamp: '2026-06-10T12:00:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 35, anomalyLevel: 'critical', signal: 'Negative sentiment surge — #DelhiSmog trending', timestamp: '2026-06-10T12:15:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 41, anomalyLevel: 'critical', signal: 'Visibility below 200m — flight delays at IGI', timestamp: '2026-06-10T13:00:00Z' },
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 55, anomalyLevel: 'moderate', signal: 'AQI recovering to 198 — wind shift detected', timestamp: '2026-06-10T16:00:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 72, anomalyLevel: 'good', signal: 'Sentiment stabilizing — relief tweets increasing', timestamp: '2026-06-10T18:00:00Z' },
  ];

  store.replayData['2026-06-11'] = [
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 90, anomalyLevel: 'good', signal: 'Morning AQI at 52 — excellent air quality', timestamp: '2026-06-11T05:00:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 85, anomalyLevel: 'good', signal: 'All metro lines operational — normal load', timestamp: '2026-06-11T06:00:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 91, anomalyLevel: 'good', signal: 'Positive sentiment dominant — morning calm', timestamp: '2026-06-11T06:30:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 38, anomalyLevel: 'critical', signal: 'Blue Line signal failure — 45 min delays', timestamp: '2026-06-11T08:30:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 29, anomalyLevel: 'critical', signal: 'Commuter rage spiking — #MetroFail trending', timestamp: '2026-06-11T09:00:00Z' },
    { agentId: 'air_quality', domain: 'air-quality', healthScore: 73, anomalyLevel: 'moderate', signal: 'PM10 rising near construction zones in Dwarka', timestamp: '2026-06-11T10:00:00Z' },
    { agentId: 'transport', domain: 'transport', healthScore: 65, anomalyLevel: 'moderate', signal: 'Blue Line partially restored — residual delays', timestamp: '2026-06-11T11:00:00Z' },
    { agentId: 'sentiment', domain: 'sentiment', healthScore: 60, anomalyLevel: 'moderate', signal: 'Sentiment recovering — frustration subsiding', timestamp: '2026-06-11T12:00:00Z' },
  ];

  console.log('[SEED] Replay data loaded:', Object.keys(store.replayData).join(', '));
}

/**
 * Return sorted array of all available replay date strings.
 */
function getReplayDates() {
  return Object.keys(store.replayData).sort();
}

/**
 * Return the signal array for a given date, sorted by timestamp ascending.
 * Returns null if the date has no data.
 */
function getReplaySignals(date) {
  const signals = store.replayData[date];
  if (!signals) return null;
  return [...signals].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = {
  store, addSignal, getLast24hSignals, isSignalStale,
  setCascade, clearCascade, isCascadeCooldownActive,
  seedReplayData, getReplayDates, getReplaySignals,
};
