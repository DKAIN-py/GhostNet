import { useCallback, useReducer, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { T, getSeverityStyle } from '../lib/theme';
import { useReplayEngine } from '../hooks/useReplayEngine';
import {
  DELHI_NOV_2023,
  REPLAY_CASCADE,
  CASCADE_FIRE_INDEX,
  TOTAL_HOURS,
  REPLAY_AGENT_META,
  REPLAY_SECTOR_NAME,
  REPLAY_DISTRICT,
} from '../lib/replayData';

// ─────────────────────────────────────────────────────────
// GHOSTNET — Historical Replay
//
// This page is a frontend-controlled historical simulation.
// It does NOT touch Socket.io, GhostnetContext, or any live
// backend state — DELHI_NOV_2023 / REPLAY_CASCADE / useReplayEngine
// remain the single source of truth, exactly as before. Everything
// added below (timeline phases, convergence bars, system analysis
// text) is *derived* deterministically from that same static data —
// nothing here is randomly generated or fetched.
// ─────────────────────────────────────────────────────────

const AGENT_IDS = ['air_quality', 'transport', 'sentiment'];

function severityKey(anomalyLevel) {
  return anomalyLevel;
}

function abbr(agentId) {
  if (!agentId) return '??';
  return agentId.split('_').map((w) => w[0]).join('').toUpperCase().slice(0, 3);
}

// ── Phase breakpoints — computed once from DELHI_NOV_2023 itself ──
// (module scope, runs once at import time since the dataset is static).
// earlyIndex:       first signal that leaves the "good" band
// convergenceIndex: first point where 2+ of the 3 domains are
//                    simultaneously critical
// peakIndex:        start of the 3-signal group containing the
//                    single lowest health score in the whole dataset
// recoveryIndex:     the group right after peak (matches the dataset's
//                    own "// Recovery begins" comment placement)
function derivePhaseBreakpoints(data) {
  const lastByAgent = {};
  let earlyIndex = null;
  let convergenceIndex = null;
  let minHealth = Infinity;
  let minHealthIdx = 0;

  data.forEach((sig, i) => {
    lastByAgent[sig.agentId] = sig.anomalyLevel;

    if (earlyIndex === null && sig.anomalyLevel === 'moderate') {
      earlyIndex = i;
    }

    const criticalCount = Object.values(lastByAgent).filter((v) => v === 'critical').length;
    if (convergenceIndex === null && criticalCount >= 2) {
      convergenceIndex = i;
    }

    if (sig.healthScore < minHealth) {
      minHealth = sig.healthScore;
      minHealthIdx = i;
    }
  });

  const peakIndex = Math.floor(minHealthIdx / 3) * 3;
  const recoveryIndex = Math.min(peakIndex + 3, data.length - 1);

  return {
    earlyIndex: earlyIndex ?? 0,
    convergenceIndex: convergenceIndex ?? CASCADE_FIRE_INDEX,
    peakIndex,
    recoveryIndex,
  };
}

const BREAKPOINTS = derivePhaseBreakpoints(DELHI_NOV_2023);

const PHASES = [
  { key: 'NORMAL',      label: 'NORMAL' },
  { key: 'EARLY',       label: 'EARLY WARNING' },
  { key: 'CONVERGENCE', label: 'CONVERGENCE' },
  { key: 'CASCADE',     label: 'CASCADE DETECTED' },
  { key: 'PEAK',        label: 'PEAK' },
  { key: 'RECOVERY',    label: 'RECOVERY' },
];

function getPhase(idx) {
  const { earlyIndex, convergenceIndex, peakIndex, recoveryIndex } = BREAKPOINTS;
  if (idx >= recoveryIndex) return 'RECOVERY';
  if (idx >= peakIndex) return 'PEAK';
  if (idx >= CASCADE_FIRE_INDEX) return 'CASCADE';
  if (idx >= convergenceIndex) return 'CONVERGENCE';
  if (idx >= earlyIndex) return 'EARLY';
  return 'NORMAL';
}

// ── Deterministic analysis text, keyed only by phase + current signal
// state. No LLM, no backend — same idea as the dataset itself: this
// already happened, we're just narrating it. ──
const PHASE_NARRATIVE = {
  NORMAL:      'Monitoring baseline conditions. All domains nominal.',
  EARLY:       'Air quality deterioration detected. Transport degradation beginning.',
  CONVERGENCE: 'Independent signals are converging beyond normal variance.',
  CASCADE:     'Multi-agent cascade threshold crossed.',
  PEAK:        'Predicted crisis has reached historical peak conditions.',
  RECOVERY:    'System indicators beginning to normalize.',
};

// Local mini-state for replay — doesn't pollute live dashboard
function replayReducer(state, action) {
  switch (action.type) {
    case 'SIGNAL': {
      const s = action.payload;
      return {
        ...state,
        signals: { ...state.signals, [s.agentId]: s },
        feed: [s, ...state.feed].slice(0, 60),
      };
    }
    case 'CASCADE':   return { ...state, cascade: action.payload };
    case 'CLEAR':     return { ...state, cascade: null };
    case 'RESET':     return initialReplayState;
    default:          return state;
  }
}

const initialReplayState = {
  signals: {
    air_quality: DELHI_NOV_2023[0],
    transport:   DELHI_NOV_2023[1],
    sentiment:   DELHI_NOV_2023[2],
  },
  feed:    [],
  cascade: null,
};

export default function Replay() {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState);

  const onSignal       = useCallback((s) => dispatch({ type: 'SIGNAL',  payload: s }), []);
  const onCascade      = useCallback((c) => dispatch({ type: 'CASCADE', payload: c }), []);
  const onCascadeClear = useCallback(()  => dispatch({ type: 'CLEAR'              }), []);
  const onComplete     = useCallback(()  => {}, []);

  const replay = useReplayEngine({ onSignal, onCascade, onCascadeClear, onComplete });

  function handleReset() {
    replay.reset();
    dispatch({ type: 'RESET' });
  }

  const cascadeHour = Math.round((CASCADE_FIRE_INDEX / DELHI_NOV_2023.length) * TOTAL_HOURS);
  const currentHour = Math.round((replay.currentIndex / DELHI_NOV_2023.length) * TOTAL_HOURS);
  const phase = getPhase(replay.currentIndex);

  const sparklines = useMemo(() => {
    const byAgent = { air_quality: [], transport: [], sentiment: [] };
    [...state.feed].reverse().forEach((s) => {
      if (byAgent[s.agentId]) byAgent[s.agentId].push(s.healthScore);
    });
    return byAgent;
  }, [state.feed]);

  const analysis = useMemo(() => {
    const deteriorating = AGENT_IDS.filter((id) => state.signals[id]?.anomalyLevel !== 'good').length;
    const critical = AGENT_IDS.filter((id) => state.signals[id]?.anomalyLevel === 'critical').length;
    return {
      headline: PHASE_NARRATIVE[phase],
      reporting: AGENT_IDS.length,
      deteriorating,
      critical,
    };
  }, [phase, state.signals]);

  const simStatus = replay.completed ? 'COMPLETE' : replay.isPlaying ? 'RUNNING' : 'PAUSED';

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto"
      style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ============================================================
          HEADER
      ============================================================ */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.25em] uppercase font-bold" style={{ color: T.text.micro }}>
          GHOSTNET // HISTORICAL REPLAY
        </span>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl tracking-[0.06em] uppercase font-bold" style={{ color: T.text.primary }}>
              Delhi Air Quality Crisis
            </h1>
            <p className="text-[11px] tracking-widest mt-1 uppercase" style={{ color: T.text.secondary }}>
              {REPLAY_SECTOR_NAME} · {REPLAY_DISTRICT} · Nov 01 — Nov 03, 2023
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 self-start sm:self-auto"
            style={{ border: `1px solid ${T.border.default}`, background: T.bg.surface }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.text.muted }} />
            <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.secondary }}>
              SIMULATION MODE · LOCAL HISTORICAL DATA
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================
          EARLY WARNING — the headline metric of the whole page
      ============================================================ */}
      <div className="flex flex-col sm:flex-row items-stretch gap-4">
        <div className="flex-[2] flex flex-col sm:flex-row items-center gap-4 sm:gap-8 px-6 py-6"
          style={{ border: `2px solid ${T.cascade.border}`, background: T.cascade.bg }}>
          <div className="text-center sm:text-left">
            <span className="text-[10px] tracking-[0.25em] uppercase font-bold" style={{ color: 'rgba(252,250,245,0.55)' }}>
              EARLY WARNING
            </span>
            <div className="flex items-baseline gap-2 justify-center sm:justify-start">
              <span className="text-6xl sm:text-7xl font-bold tracking-tight leading-none" style={{ color: T.cascade.text }}>
                {REPLAY_CASCADE.hoursUntil}
              </span>
              <span className="text-lg tracking-widest uppercase font-bold" style={{ color: 'rgba(252,250,245,0.7)' }}>
                hours
              </span>
            </div>
            <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: 'rgba(252,250,245,0.75)' }}>
              before real-world peak
            </span>
          </div>
          <div className="h-px w-full sm:h-16 sm:w-px" style={{ background: 'rgba(252,250,245,0.2)' }} />
          <p className="text-[12px] leading-relaxed text-center sm:text-left" style={{ color: 'rgba(252,250,245,0.85)' }}>
            GHOSTNET detected the multi-agent cascade <strong>before</strong> the historical smog emergency reached its documented peak — proof the system can surface a developing crisis while there is still time to act.
          </p>
        </div>

        {/* Prediction vs. real world */}
        <div className="flex-1 flex flex-col justify-center gap-3 px-5 py-5"
          style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>
          <span className="text-[9px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.micro }}>
            PREDICTION VS. REAL WORLD
          </span>
          <div className="flex items-center justify-between text-center">
            <PredictionStep label="NOV 1" sub="BASELINE" />
            <PredictionArrow />
            <PredictionStep label="CASCADE" sub="DETECTED" accent />
            <PredictionArrow />
            <PredictionStep label="NOV 3" sub="REAL PEAK" />
          </div>
        </div>
      </div>

      {/* ============================================================
          CONTROLS
      ============================================================ */}
      <div className="flex flex-col gap-3 p-4"
        style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
            HISTORICAL SIMULATION
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{
              background: simStatus === 'RUNNING' ? T.severity.good.border : simStatus === 'COMPLETE' ? T.text.muted : T.severity.moderate.border,
              animation: simStatus === 'RUNNING' ? 'replay-pulse 1.4s ease-in-out infinite' : 'none',
            }} />
            <span className="text-[10px] tracking-widest uppercase font-bold" style={{
              color: simStatus === 'RUNNING' ? T.severity.good.border : simStatus === 'COMPLETE' ? T.text.muted : T.severity.moderate.text,
            }}>
              {simStatus}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={replay.isPlaying ? replay.pause : replay.play}
              disabled={replay.completed}
              className="text-[12px] tracking-widest uppercase px-4 py-2.5 font-bold transition-all"
              style={{
                background: replay.isPlaying ? T.cascade.bg    : T.text.primary,
                color:      replay.isPlaying ? T.cascade.text  : T.bg.card,
                border:     `1px solid ${T.border.strong}`,
                fontFamily: T.font.mono,
                opacity:    replay.completed ? 0.4 : 1,
                cursor:     replay.completed ? 'default' : 'pointer',
              }}
            >
              {replay.isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>

            <button
              onClick={handleReset}
              className="text-[11px] tracking-widest uppercase px-3.5 py-2.5 font-bold transition-all"
              style={{
                border:     `1px solid ${T.border.default}`,
                color:      T.text.secondary,
                background: T.bg.surface,
                fontFamily: T.font.mono,
                cursor:     'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = T.bg.hover}
              onMouseLeave={(e) => e.currentTarget.style.background = T.bg.surface}
            >
              ↺ RESET
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>
              SPEED
            </span>
            <div className="flex gap-1">
              {replay.speedOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => replay.changeSpeed(s)}
                  className="text-[11px] tracking-widest px-2.5 py-1.5 font-bold transition-all"
                  style={{
                    border:     `1px solid ${replay.speed === s ? T.border.strong : T.border.subtle}`,
                    background: replay.speed === s ? T.text.primary : 'transparent',
                    color:      replay.speed === s ? T.bg.card : T.text.muted,
                    fontFamily: T.font.mono,
                    cursor: 'pointer',
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>
                TIME
              </p>
              <p className="text-base font-bold" style={{ color: T.text.primary }}>
                +{currentHour}h
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>
                SIGNALS PROCESSED
              </p>
              <p className="text-base font-bold" style={{ color: T.text.primary }}>
                {replay.currentIndex}/{replay.total}
              </p>
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex flex-col gap-1.5">
          <div className="relative w-full h-6 flex items-center" style={{ cursor: 'pointer' }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct  = (e.clientX - rect.left) / rect.width;
              replay.seekTo(Math.round(pct * (replay.total - 1)));
            }}
          >
            <div className="w-full h-[3px] relative" style={{ background: T.border.subtle }}>
              <div className="h-full transition-all duration-200"
                style={{ width: `${replay.progress}%`, background: T.text.primary }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4"
                style={{ left: `${(CASCADE_FIRE_INDEX / (replay.total - 1)) * 100}%`, background: T.cascade.bg }}
              >
                <span className="absolute -top-5 -translate-x-1/2 text-[9px] tracking-widest uppercase whitespace-nowrap font-bold"
                  style={{ color: T.cascade.bg }}>
                  ▲ CASCADE
                </span>
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full transition-all duration-200"
                style={{ left: `${replay.progress}%`, background: T.text.primary, border: `2px solid ${T.bg.card}` }}
              />
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-[9px] tracking-widest font-bold" style={{ color: T.text.micro }}>NOV 1 · 06:00</span>
            <span className="text-[9px] tracking-widest font-bold" style={{ color: T.cascade.bg }}>CASCADE +{cascadeHour}h</span>
            <span className="text-[9px] tracking-widest font-bold" style={{ color: T.text.micro }}>NOV 3 · PEAK</span>
            <span className="text-[9px] tracking-widest font-bold" style={{ color: T.text.micro }}>NOV 4 · RECOVERY</span>
          </div>
        </div>

        {replay.completed && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5"
            style={{ background: T.bg.surface, border: `1px solid ${T.border.subtle}` }}>
            <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: T.text.secondary }}>
              ✓ Replay complete — GHOSTNET fired 41h before the real emergency
            </span>
            <button onClick={handleReset}
              className="text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold self-start sm:self-auto"
              style={{ border: `1px solid ${T.border.default}`, color: T.text.primary, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}>
              REPLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* ============================================================
          PHASE TIMELINE — the historical narrative arc
      ============================================================ */}
      <PhaseTimeline currentIndex={replay.currentIndex} total={replay.total} phase={phase} />

      {/* ============================================================
          CASCADE EVENT
      ============================================================ */}
      <ReplayCascadeCard cascade={state.cascade} onClear={() => dispatch({ type: 'CLEAR' })} />

      {/* ============================================================
          SYSTEM INTELLIGENCE
      ============================================================ */}
      <SystemIntelligencePanel analysis={analysis} cascade={state.cascade} phase={phase} />

      {/* ============================================================
          SIGNAL CONVERGENCE
      ============================================================ */}
      <SignalConvergence signals={state.signals} />

      {/* ============================================================
          THREE-AGENT INTELLIGENCE PANEL
      ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ReplayAgentCard signal={state.signals.air_quality} cascade={state.cascade} sparkline={sparklines.air_quality} />
        <ReplayAgentCard signal={state.signals.transport}   cascade={state.cascade} sparkline={sparklines.transport} />
        <ReplayAgentCard signal={state.signals.sentiment}   cascade={state.cascade} sparkline={sparklines.sentiment} />
      </div>

      {/* ============================================================
          INTELLIGENCE FEED
      ============================================================ */}
      <div style={{ border: `1px solid ${T.border.default}` }}>
        <ReplayFeed feed={state.feed} />
      </div>

      <style>{`@keyframes replay-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </div>
  );
}

/* ============================================================
   PREDICTION VS REAL WORLD — small helpers
============================================================ */

function PredictionStep({ label, sub, accent }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[12px] tracking-wide font-bold" style={{ color: accent ? T.cascade.bg : T.text.primary }}>
        {label}
      </span>
      <span className="text-[8px] tracking-[0.15em] uppercase" style={{ color: T.text.micro }}>
        {sub}
      </span>
    </div>
  );
}

function PredictionArrow() {
  return <span style={{ color: T.text.micro, fontSize: 14 }}>→</span>;
}

/* ============================================================
   PHASE TIMELINE
============================================================ */

function PhaseTimeline({ currentIndex, total, phase }) {
  const at = (idx) => `${(idx / (total - 1)) * 100}%`;

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
          HISTORICAL TIMELINE
        </span>
        <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-0.5" style={{ border: `1px solid ${T.cascade.bg}`, color: T.cascade.bg }}>
          {phase}
        </span>
      </div>

      <div className="px-5 pt-7 pb-5">
        <div className="relative w-full h-[3px]" style={{ background: T.border.subtle }}>
          <div className="h-full transition-all duration-300" style={{ width: `${(currentIndex / (total - 1)) * 100}%`, background: T.text.primary }} />

          <TimelineMarker leftPct={at(BREAKPOINTS.earlyIndex)} />
          <TimelineMarker leftPct={at(BREAKPOINTS.convergenceIndex)} />
          <TimelineMarker leftPct={at(CASCADE_FIRE_INDEX)} strong label="▲" />
          <TimelineMarker leftPct={at(BREAKPOINTS.peakIndex)} strong />
          <TimelineMarker leftPct={at(BREAKPOINTS.recoveryIndex)} />

          {/* current position marker */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
            style={{ left: `${(currentIndex / (total - 1)) * 100}%`, background: T.text.primary, border: `2px solid ${T.bg.card}` }} />
        </div>

        <div className="flex justify-between mt-5">
          {PHASES.map((p) => (
            <span key={p.key} className="text-[8px] sm:text-[9px] tracking-widest uppercase font-bold text-center"
              style={{ color: p.key === phase ? T.text.primary : T.text.micro, flex: 1 }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineMarker({ leftPct, strong, label }) {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: leftPct }}>
      <span className="block" style={{
        width: strong ? 2 : 1,
        height: strong ? 14 : 10,
        background: strong ? T.cascade.bg : T.border.strong,
        margin: '0 auto',
      }} />
    </div>
  );
}

/* ============================================================
   SYSTEM INTELLIGENCE PANEL
============================================================ */

function SystemIntelligencePanel({ analysis, cascade, phase }) {
  const isCascadeOrLater = ['CASCADE', 'PEAK', 'RECOVERY'].includes(phase);

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
          SYSTEM ANALYSIS
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed font-bold" style={{ color: T.text.primary }}>
          {analysis.headline}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="AGENTS REPORTING" value={analysis.reporting} />
          <Stat label="DOMAINS DETERIORATING" value={analysis.deteriorating} accent={analysis.deteriorating > 0} />
          <Stat label="CASCADE STATUS" value={cascade ? 'ACTIVE' : isCascadeOrLater ? 'ACTIVE' : 'MONITORING'} accent={!!cascade} />
          <Stat label="ADVANCE WARNING" value={cascade ? `${REPLAY_CASCADE.hoursUntil}h` : '—'} accent={!!cascade} />
        </div>

        {cascade && (
          <div className="px-3 py-2.5" style={{ background: T.bg.surface, border: `1px solid ${T.border.subtle}` }}>
            <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>PREDICTED EVENT</span>
            <p className="text-[12px] mt-0.5" style={{ color: T.text.primary }}>{cascade.predictedEvent}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[8px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-lg font-bold truncate" style={{ color: accent ? T.cascade.bg : T.text.primary }}>{value}</span>
    </div>
  );
}

/* ============================================================
   SIGNAL CONVERGENCE
============================================================ */

function SignalConvergence({ signals }) {
  const initial = {
    air_quality: DELHI_NOV_2023[0].healthScore,
    transport:   DELHI_NOV_2023[1].healthScore,
    sentiment:   DELHI_NOV_2023[2].healthScore,
  };

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
          SIGNAL CONVERGENCE
        </span>
        <span className="text-[9px] tracking-wide ml-3" style={{ color: T.text.micro }}>
          THREE INDEPENDENT DOMAINS
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {AGENT_IDS.map((id) => {
          const meta = REPLAY_AGENT_META[id];
          const sig = signals[id];
          const from = initial[id];
          const to = sig?.healthScore ?? from;
          const style = getSeverityStyle(sig?.anomalyLevel);

          return (
            <div key={id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.secondary }}>
                  {meta.label}
                </span>
                <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>
                  {from} <span style={{ color: T.text.micro }}>→</span> {to}
                </span>
              </div>
              <div className="relative w-full h-2" style={{ background: T.border.subtle }}>
                <div className="absolute inset-y-0 left-0 transition-all duration-500"
                  style={{ width: `${Math.max(2, Math.min(100, to))}%`, background: style.border }} />
              </div>
            </div>
          );
        })}

        <p className="text-[10px] tracking-wide leading-relaxed text-center pt-2" style={{ color: T.text.micro, borderTop: `1px solid ${T.border.subtle}` }}>
          No single metric tells the whole story — the signal is in the convergence.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   CASCADE CARD (unchanged logic, same visual language as live)
============================================================ */

function ReplayCascadeCard({ cascade, onClear }) {
  if (!cascade) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5"
        style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
        <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: T.text.primary }}>
          CASCADE DETECTOR
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-[6px] h-[6px] rounded-full"
            style={{ background: T.text.muted, animation: 'pulse-dot 2.5s infinite' }} />
          <span className="text-[11px] tracking-widest uppercase" style={{ color: T.text.secondary }}>
            MONITORING — NO CASCADE
          </span>
        </span>
        <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4"
      style={{ background: T.cascade.bg, border: `2px solid ${T.cascade.border}`, fontFamily: T.font.mono, animation: 'cascade-pulse 1s ease infinite' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm tracking-wide uppercase font-bold" style={{ color: T.cascade.text }}>
          ▲ Cascade Detected — {cascade.primarySectorName || cascade.primarySectorId}
        </span>
        <button onClick={onClear}
          className="text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold"
          style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}>
          CLEAR
        </button>
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(252,250,245,0.8)' }}>
        {cascade.predictedEvent}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'CONFIDENCE',        value: `${cascade.confidence}%` },
          { label: 'SCORE',             value: cascade.cascadeScore?.toFixed(2) ?? '—' },
          { label: 'HOURS UNTIL PEAK',  value: `~${cascade.hoursUntil}h` },
          { label: 'DISTRICT',          value: cascade.district || '—' },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 min-w-0">
            <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: 'rgba(252,250,245,0.45)' }}>{s.label}</span>
            <span className="text-[13px] font-bold leading-tight truncate" style={{ color: T.cascade.text }} title={String(s.value)}>{s.value}</span>
          </div>
        ))}
      </div>

      {cascade.triggeredAgents?.length > 0 && (
        <div>
          <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: 'rgba(252,250,245,0.45)' }}>Contributing Signals</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {cascade.triggeredAgents.map((a) => (
              <span key={a} className="text-[10px] tracking-wider uppercase px-2 py-1"
                style={{ border: '1px solid rgba(252,250,245,0.3)', color: 'rgba(252,250,245,0.85)' }}>
                {REPLAY_AGENT_META[a]?.label || a.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {cascade.recommendations?.length > 0 && (
        <div>
          <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: 'rgba(252,250,245,0.45)' }}>Recommended Actions</span>
          <ul className="flex flex-col gap-1 mt-1.5 m-0 p-0" style={{ listStyle: 'none' }}>
            {cascade.recommendations.map((rec, i) => (
              <li key={i} className="text-[12px] leading-relaxed flex gap-2" style={{ color: 'rgba(252,250,245,0.9)' }}>
                <span style={{ color: 'rgba(252,250,245,0.5)' }}>{i + 1}.</span>{rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`@keyframes cascade-pulse { 0%,100%{opacity:1} 50%{opacity:0.88} }`}</style>
    </div>
  );
}

/* ============================================================
   AGENT CARD — same core logic as before, chart slightly taller
============================================================ */

function ReplayAgentCard({ signal, cascade, sparkline = [] }) {
  if (!signal) return null;
  const meta        = REPLAY_AGENT_META[signal.agentId] || {};
  const style       = getSeverityStyle(severityKey(signal.anomalyLevel));
  const triggered   = !!cascade && cascade.triggeredAgents?.includes(signal.agentId);
  const isCritical  = signal.anomalyLevel === 'critical';
  const isModerate  = signal.anomalyLevel === 'moderate';

  const cardBg   = triggered ? T.cascade.bg   : isCritical ? style.bg   : isModerate ? style.bg   : T.bg.card;
  const cardText = triggered ? T.cascade.text : isCritical ? style.text : isModerate ? style.text : T.text.primary;
  const cardBorder = triggered
    ? `2px solid ${T.cascade.border}`
    : isCritical
    ? `2px solid ${style.border}`
    : isModerate
    ? `1px solid ${style.border}`
    : `1px solid ${T.border.subtle}`;
  const subColor   = triggered ? 'rgba(252,250,245,0.5)' : isCritical ? 'rgba(252,250,245,0.55)' : isModerate ? 'rgba(43,40,34,0.6)' : T.text.secondary;
  const microColor = triggered ? 'rgba(252,250,245,0.35)' : isCritical ? 'rgba(252,250,245,0.4)' : isModerate ? 'rgba(43,40,34,0.45)' : T.text.micro;

  const chartData = sparkline.map((v, i) => ({ i, v }));
  const trend = chartData.length > 1 ? chartData[chartData.length - 1].v - chartData[0].v : 0;

  return (
    <div className="flex flex-col gap-3 p-4 transition-all duration-500 min-w-0"
      style={{
        background: cardBg,
        color:      cardText,
        border:     cardBorder,
        fontFamily: T.font.mono,
        animation:  triggered ? 'cascade-pulse 1s ease infinite' : 'none',
      }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] tracking-wide uppercase font-bold truncate" style={{ color: cardText }}>
          {meta.label || signal.agentId}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {triggered && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
              style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text }}
              title="This reading is feeding the active cascade calculation">
              TRIGGERED
            </span>
          )}
          <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
            style={{
              border: `1px solid ${triggered ? T.cascade.text : style.border}`,
              color: triggered ? T.cascade.text : cardText,
              background: triggered ? 'transparent' : isModerate ? 'rgba(252,250,245,0.5)' : 'transparent',
            }}>
            {signal.anomalyLevel.toUpperCase()}
          </span>
        </div>
      </div>

      <span className="text-[10px] tracking-wider truncate" style={{ color: microColor }}>
        {signal.sectorId} · {signal.district}
      </span>

      <div className="flex items-baseline gap-2">
        <span className="text-5xl sm:text-6xl font-bold tracking-tight leading-none" style={{ color: cardText }}>
          {signal.healthScore}
        </span>
        <span className="text-base tracking-widest" style={{ color: subColor }}>/100</span>
        {chartData.length > 1 && (
          <span className="text-[11px] font-bold ml-auto" style={{ color: cardText }}>
            {trend < 0 ? '↓' : trend > 0 ? '↑' : '·'} {Math.abs(trend)}
          </span>
        )}
      </div>

      <div className="w-full h-[3px] relative overflow-hidden" style={{ background: triggered ? 'rgba(252,250,245,0.15)' : isModerate ? 'rgba(43,40,34,0.15)' : T.border.subtle }}>
        <div className="h-full transition-all duration-700" style={{ width: `${100 - signal.healthScore}%`, background: cardText }} />
      </div>

      {chartData.length > 1 && (
        <div style={{ height: 64, minWidth: 0, width: '100%', marginLeft: -8, marginRight: -8 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
              <defs>
                <filter id={`replay-glow-${signal.agentId}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <Line
                type="monotone" dataKey="v" stroke={cardText} strokeWidth={2} dot={false}
                isAnimationActive animationDuration={300}
                style={{ filter: `url(#replay-glow-${signal.agentId})` }}
              />
              <Tooltip
                contentStyle={{ background: cardBg, border: `1px solid ${triggered ? T.cascade.text : T.border.default}`, color: cardText, fontSize: '11px', fontFamily: T.font.mono, padding: '4px 8px' }}
                formatter={(v) => [`${v}/100`, 'health']}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: subColor }}>{signal.signal}</p>

      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase truncate" style={{ color: microColor }}>/{meta.domain || signal.domain}</span>
        <span className="text-[10px] shrink-0" style={{ color: microColor }}>
          {new Date(signal.timestamp).toLocaleString('en-IN', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <style>{`@keyframes cascade-pulse { 0%,100%{opacity:1} 50%{opacity:0.88} }`}</style>
    </div>
  );
}

/* ============================================================
   INTELLIGENCE FEED
============================================================ */

function ReplayFeed({ feed }) {
  return (
    <div style={{ fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
          INTELLIGENCE FEED
        </span>
        <span className="text-[10px]" style={{ color: T.text.micro }}>{feed.length} signals processed</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
        {feed.length === 0 && (
          <div className="px-4 py-6 text-center">
            <span className="text-[10px] tracking-widest" style={{ color: T.text.micro }}>
              Hit PLAY to start processing signals
            </span>
          </div>
        )}
        {feed.map((sig, i) => {
          const style = getSeverityStyle(sig.anomalyLevel);
          const meta = REPLAY_AGENT_META[sig.agentId] || {};
          return (
            <div key={`${sig.agentId}-${sig.timestamp}-${i}`}
              className="flex items-start gap-3 px-3 sm:px-4 py-2.5"
              style={{ borderBottom: `1px solid ${T.border.subtle}`, background: i === 0 ? T.bg.surface : 'transparent', animation: i === 0 ? 'row-in 0.2s ease' : 'none' }}>
              <span className="text-[9px] shrink-0 w-14 pt-0.5" style={{ color: T.text.micro }}>
                {new Date(sig.timestamp).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[9px] font-bold w-8 shrink-0 pt-0.5" style={{ color: sig.anomalyLevel === 'critical' ? style.border : T.text.muted }}>
                {abbr(sig.agentId)}
              </span>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-wide uppercase font-bold truncate" style={{ color: T.text.primary }}>
                    {meta.label || sig.agentId}
                  </span>
                  <span className="text-[8px] tracking-widest uppercase font-bold px-1.5 py-0.5 shrink-0"
                    style={{ border: `1px solid ${style.border}`, color: style.border }}>
                    {sig.anomalyLevel}
                  </span>
                </div>
                <span className="text-[11px] leading-snug" style={{ color: T.text.secondary }}>{sig.signal}</span>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes row-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}