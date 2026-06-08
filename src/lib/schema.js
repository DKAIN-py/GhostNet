// ─────────────────────────────────────────────────────────
//  GHOSTNET — Signal Schema v1.1  (LOCKED DAY 1)
//  Shared contract between AI / Node / MERN engineers
// ─────────────────────────────────────────────────────────

export const AGENT_IDS = {
  AIR_QUALITY: 'air_quality',
  TRANSPORT:   'transport',
  SENTIMENT:   'sentiment',
};

// ── Socket.io Event Names ──────────────────────────────────
export const SOCKET_EVENTS = {
  AGENT_SIGNAL:   'agent-signal',
  CASCADE_ALERT:  'cascade-alert',
  CASCADE_CLEAR:  'cascade-clear',
};

// ── Cascade Weights (AI engineer uses these for scoring) ───
export const CASCADE_WEIGHTS = {
  air_quality: 0.40,
  transport:   0.35,
  sentiment:   0.25,
};
export const CASCADE_THRESHOLD = 0.65;

// ── Mock Data ──────────────────────────────────────────────
export const MOCK_SIGNALS = [
  { agentId: 'air_quality', domain: 'air',       healthScore: 34, anomalyLevel: 'critical', signal: 'AQI at 168, PM2.5 rising fast',                  timestamp: new Date().toISOString() },
  { agentId: 'transport',   domain: 'transport',  healthScore: 55, anomalyLevel: 'moderate', signal: 'NH-48 congestion at 45%',                        timestamp: new Date().toISOString() },
  { agentId: 'sentiment',   domain: 'social',     healthScore: 28, anomalyLevel: 'critical', signal: 'Negative tweet surge — smog keywords trending',  timestamp: new Date().toISOString() },
];

export const MOCK_CASCADE = {
  confidence:      87,
  predictedEvent:  'Severe smog emergency',
  hoursUntil:      38,
  recommendation:  'Issue public health advisory immediately',
  agentsTriggered: ['air_quality', 'sentiment'],
  timestamp:       new Date().toISOString(),
};