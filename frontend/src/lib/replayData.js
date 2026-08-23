// ─────────────────────────────────────────────────────────
//  GHOSTNET — Delhi Nov 2023 Historical Replay Data
//  This is the proof: cascade fires ~41 hours before
//  the real smog emergency on Nov 3, 2023
// ─────────────────────────────────────────────────────────

// Base time: Nov 1, 2023 06:00 IST
const BASE = new Date('2023-11-01T00:30:00.000Z'); // 06:00 IST

function t(hoursOffset) {
  return new Date(BASE.getTime() + hoursOffset * 3600 * 1000).toISOString();
}

// Fixed sector for this whole historical narrative — reusing a known-valid
// sector from the live mesh (DEL_EAST_LN / Laxmi Nagar, East Delhi) so the
// replay reads as "this really happened, here" rather than a placeholder.
export const REPLAY_SECTOR_ID = 'DEL_EAST_LN';
export const REPLAY_SECTOR_NAME = 'Laxmi Nagar';
export const REPLAY_DISTRICT = 'East Delhi';

// FIX: previously sig() didn't set sectorId/district at all, so every place
// that displayed them (Replay.jsx's header, every ReplayAgentCard's sector
// line) rendered "undefined · undefined".
function sig(agentId, domain, healthScore, anomalyLevel, signal, hoursOffset) {
  return {
    agentId,
    domain,
    healthScore,
    anomalyLevel,
    signal,
    sectorId: REPLAY_SECTOR_ID,
    district: REPLAY_DISTRICT,
    timestamp: t(hoursOffset),
  };
}

// Local display metadata for this replay's 3 signal streams — the live
// AGENT_META (from lib/schema.js) doesn't know these ids, so without this
// the cards would just show the raw "air_quality" / "transport" / "sentiment"
// strings instead of a proper label.
export const REPLAY_AGENT_META = {
  air_quality: { label: 'Air Quality', domain: 'environment' },
  transport:   { label: 'Transport & Congestion', domain: 'transit' },
  sentiment:   { label: 'Public Sentiment', domain: 'civic' },
};

// ── 72 signals over 3 days — gradual deterioration ────────
export const DELHI_NOV_2023 = [
  // NOV 1 — Early signs, mostly good
  sig('air_quality', 'air',       82, 'good',     'AQI at 89, seasonal baseline',               0),
  sig('transport',   'transport',  88, 'good',     'Traffic nominal, 12% congestion',            0),
  sig('sentiment',   'social',     85, 'good',     'Sentiment stable, no complaints',            0),

  sig('air_quality', 'air',       79, 'good',     'AQI at 98, slight morning rise',             2),
  sig('transport',   'transport',  85, 'good',     'Morning rush, 18% congestion',               2),
  sig('sentiment',   'social',     83, 'good',     'Normal social activity',                     2),

  sig('air_quality', 'air',       74, 'good',     'AQI at 105, wind slowing',                   4),
  sig('transport',   'transport',  80, 'good',     'Afternoon traffic building',                  4),
  sig('sentiment',   'social',     80, 'good',     'Minor air quality mentions',                  4),

  sig('air_quality', 'air',       68, 'moderate', 'AQI at 118, stubble burning detected',       6),
  sig('transport',   'transport',  76, 'good',     'Evening rush, 25% congestion',               6),
  sig('sentiment',   'social',     75, 'moderate', 'Rising complaints about haze',               6),

  sig('air_quality', 'air',       63, 'moderate', 'AQI at 128, PM2.5 climbing',                 8),
  sig('transport',   'transport',  72, 'moderate', 'Visibility drop affecting highway speeds',   8),
  sig('sentiment',   'social',     70, 'moderate', 'Smog hashtags trending locally',             8),

  sig('air_quality', 'air',       58, 'moderate', 'AQI at 138, multiple hotspots',             10),
  sig('transport',   'transport',  68, 'moderate', 'Outer ring road slowdown 35%',              10),
  sig('sentiment',   'social',     65, 'moderate', 'Respiratory complaints rising on Twitter',  10),

  // NOV 1 NIGHT — Deteriorating fast
  sig('air_quality', 'air',       52, 'moderate', 'AQI at 148, approaching critical',          12),
  sig('transport',   'transport',  64, 'moderate', 'Night traffic disrupted by low visibility', 12),
  sig('sentiment',   'social',     60, 'moderate', 'School closure demands appearing',          12),

  sig('air_quality', 'air',       47, 'critical', 'AQI at 158, critical threshold breached',   14),
  sig('transport',   'transport',  60, 'moderate', 'Accidents reported on NH-48',               14),
  sig('sentiment',   'social',     55, 'moderate', 'Panic buying of masks reported',            14),

  // ── CASCADE FIRES HERE — 41 hours before peak ──────────
  // NOV 2 — All agents critical, cascade window opens
  sig('air_quality', 'air',       38, 'critical', 'AQI at 178, severe — all zones affected',   16),
  sig('transport',   'transport',  45, 'critical', 'Major arterials at 65% congestion',         16),
  sig('sentiment',   'social',     35, 'critical', 'Mass panic on social — #DelhiChokes',       16),

  sig('air_quality', 'air',       34, 'critical', 'AQI at 192, PM2.5 at 148µg/m³',            18),
  sig('transport',   'transport',  40, 'critical', 'Ring road jammed, diversions failing',      18),
  sig('sentiment',   'social',     30, 'critical', 'Hospitals reporting surge in OPD',          18),

  sig('air_quality', 'air',       30, 'critical', 'AQI at 210, very unhealthy for all',        20),
  sig('transport',   'transport',  38, 'critical', 'Metro overcrowded, buses delayed',          20),
  sig('sentiment',   'social',     28, 'critical', 'Politicians trending, demand action',       20),

  sig('air_quality', 'air',       26, 'critical', 'AQI at 234, hazardous zones emerging',      22),
  sig('transport',   'transport',  35, 'critical', 'Airport visibility warnings issued',        22),
  sig('sentiment',   'social',     25, 'critical', 'Viral videos of smog wall from Noida',      22),

  sig('air_quality', 'air',       22, 'critical', 'AQI at 256, schools advised to close',      24),
  sig('transport',   'transport',  32, 'critical', 'Emergency lane closures on expressways',    24),
  sig('sentiment',   'social',     22, 'critical', 'Trending: demand odd-even rule return',     24),

  sig('air_quality', 'air',       18, 'critical', 'AQI at 278, outdoor activity banned',       26),
  sig('transport',   'transport',  30, 'critical', '40% vehicles off road, still jammed',       26),
  sig('sentiment',   'social',     20, 'critical', 'National media covering Delhi smog crisis', 26),

  sig('air_quality', 'air',       15, 'critical', 'AQI at 298, near-hazardous citywide',       28),
  sig('transport',   'transport',  28, 'critical', 'Flight diversions from IGI airport',        28),
  sig('sentiment',   'social',     18, 'critical', 'International headlines — Delhi air',       28),

  // NOV 3 — PEAK EMERGENCY (real event, 41h after cascade fired)
  sig('air_quality', 'air',       10, 'critical', 'AQI at 318 — HAZARDOUS. Govt emergency.',  32),
  sig('transport',   'transport',  22, 'critical', 'City-wide transport advisory issued',       32),
  sig('sentiment',   'social',     12, 'critical', 'Supreme Court takes suo motu cognizance',  32),

  sig('air_quality', 'air',       8,  'critical', 'AQI at 334 — peak of crisis',              34),
  sig('transport',   'transport',  20, 'critical', 'Odd-even traffic rule reimposed',           34),
  sig('sentiment',   'social',     10, 'critical', 'Trending globally: #DelhiAirEmergency',    34),

  // Recovery begins
  sig('air_quality', 'air',       15, 'critical', 'AQI at 290, slight wind relief',            40),
  sig('transport',   'transport',  30, 'critical', 'Gradual easing of emergency measures',      40),
  sig('sentiment',   'social',     20, 'critical', 'Relief as AQI begins to drop',              40),

  sig('air_quality', 'air',       28, 'moderate', 'AQI at 198, improving slowly',              48),
  sig('transport',   'transport',  45, 'moderate', 'Traffic returning to normal patterns',      48),
  sig('sentiment',   'social',     35, 'moderate', 'Cautious optimism on social media',         48),

  sig('air_quality', 'air',       45, 'moderate', 'AQI at 145, wind dispersing pollutants',    56),
  sig('transport',   'transport',  60, 'moderate', 'Most roads clear, airport normal',          56),
  sig('sentiment',   'social',     50, 'moderate', 'Crisis receding, policy debate ongoing',    56),

  sig('air_quality', 'air',       62, 'moderate', 'AQI at 118, near-normal conditions',        64),
  sig('transport',   'transport',  72, 'good',     'Traffic nominal, crisis over',              64),
  sig('sentiment',   'social',     60, 'moderate', 'Post-crisis analysis trending',             64),
];

// FIX: field names now match the live cascade schema exactly
// (triggeredAgents / recommendations, not agentsTriggered / recommendation)
// — the old names silently broke the TRIGGERED badge and the recommendation
// preview since nothing actually read those field names. Also added the
// primarySectorId/Name/district/cascadeScore/spatialSpread fields so this
// object has full parity with a live sector cascade and can reuse the same
// card styling.
export const REPLAY_CASCADE = {
  alertId: 'ALT_REPLAY_NOV2023',
  primarySectorId: REPLAY_SECTOR_ID,
  primarySectorName: REPLAY_SECTOR_NAME,
  district: REPLAY_DISTRICT,
  cascadeScore: 0.91,
  confidence: 91,
  predictedEvent: 'Severe smog emergency — hazardous AQI',
  hoursUntil: 41,
  spatialSpread: [],
  triggeredAgents: ['air_quality', 'transport', 'sentiment'],
  recommendations: [
    'Issue citywide smog emergency advisory.',
    'Activate odd-even vehicle rationing.',
    'Close schools and suspend outdoor activity.',
  ],
  timestamp: new Date('2023-11-01T16:30:00.000Z').toISOString(),
};

// Index in DELHI_NOV_2023 where cascade should fire
export const CASCADE_FIRE_INDEX = 18; // hour 16 mark
export const TOTAL_HOURS = 64;