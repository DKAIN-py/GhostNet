import { useCallback, useReducer } from 'react';
import { T } from '../lib/theme';
import { useReplayEngine } from '../hooks/useReplayEngine';
import { DELHI_NOV_2023, CASCADE_FIRE_INDEX, TOTAL_HOURS } from '../lib/replayData';
import AgentCard from '../components/dashboard/AgentCard';
import CascadeBar from '../components/dashboard/CascadeBar';
import { MOCK_SIGNALS } from '../lib/schema';

// Local mini-state for replay — doesn't pollute live dashboard
function replayReducer(state, action) {
  switch (action.type) {
    case 'SIGNAL': {
      const s = action.payload;
      return {
        ...state,
        signals: { ...state.signals, [s.agentId]: s },
        feed: [s, ...state.feed].slice(0, 30),
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
    air_quality: MOCK_SIGNALS[0],
    transport:   MOCK_SIGNALS[1],
    sentiment:   MOCK_SIGNALS[2],
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

  return (
    <div className="flex flex-col gap-4 p-5 h-full overflow-y-auto"
      style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.text.primary }}>
            HISTORICAL REPLAY
          </h1>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: T.text.micro }}>
            Delhi · Nov 1–3 2023 · Smog Emergency
          </p>
        </div>
        {/* Proof badge */}
        <div className="flex items-center gap-2 px-3 py-1.5"
          style={{ border: `1px solid ${T.border.default}`, background: T.bg.surface }}>
          <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            CASCADE FIRES
          </span>
          <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>
            41 HRS EARLY
          </span>
        </div>
      </div>

      {/* ── Controls bar ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 p-4"
        style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>

        {/* Top row — play controls + speed */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button
              onClick={replay.isPlaying ? replay.pause : replay.play}
              disabled={replay.completed}
              className="text-[11px] tracking-widest uppercase px-4 py-2 font-bold transition-all"
              style={{
                background: replay.isPlaying ? T.cascade.bg    : T.text.primary,
                color:      replay.isPlaying ? T.cascade.text  : T.bg.card,
                border:     `1px solid ${T.border.strong}`,
                fontFamily: T.font.mono,
                opacity:    replay.completed ? 0.4 : 1,
              }}
            >
              {replay.isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="text-[10px] tracking-widest uppercase px-3 py-2 transition-all"
              style={{
                border:     `1px solid ${T.border.default}`,
                color:      T.text.secondary,
                background: T.bg.surface,
                fontFamily: T.font.mono,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = T.bg.hover}
              onMouseLeave={(e) => e.currentTarget.style.background = T.bg.surface}
            >
              ↺ RESET
            </button>
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
              SPEED
            </span>
            <div className="flex gap-1">
              {replay.speedOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => replay.changeSpeed(s)}
                  className="text-[10px] tracking-widest px-2 py-1 font-bold transition-all"
                  style={{
                    border:     `1px solid ${replay.speed === s ? T.border.strong : T.border.subtle}`,
                    background: replay.speed === s ? T.text.primary : 'transparent',
                    color:      replay.speed === s ? T.bg.card : T.text.muted,
                    fontFamily: T.font.mono,
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Time display */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
                ELAPSED
              </p>
              <p className="text-sm font-bold" style={{ color: T.text.primary }}>
                +{currentHour}h
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
                SIGNALS
              </p>
              <p className="text-sm font-bold" style={{ color: T.text.primary }}>
                {replay.currentIndex}/{replay.total}
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar + scrubber */}
        <div className="flex flex-col gap-1">
          <div className="relative w-full h-6 flex items-center" style={{ cursor: 'pointer' }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct  = (e.clientX - rect.left) / rect.width;
              replay.seekTo(Math.round(pct * (replay.total - 1)));
            }}
          >
            {/* Track */}
            <div className="w-full h-[2px] relative" style={{ background: T.border.subtle }}>
              {/* Fill */}
              <div className="h-full transition-all duration-200"
                style={{ width: `${replay.progress}%`, background: T.text.primary }} />
              {/* Cascade marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4"
                style={{
                  left:       `${(CASCADE_FIRE_INDEX / (replay.total - 1)) * 100}%`,
                  background: T.cascade.bg,
                }}
              >
                <span
                  className="absolute -top-5 -translate-x-1/2 text-[8px] tracking-widest uppercase whitespace-nowrap font-bold"
                  style={{ color: T.cascade.bg }}
                >
                  ▲ CASCADE
                </span>
              </div>
              {/* Scrubber thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full transition-all duration-200"
                style={{
                  left:       `${replay.progress}%`,
                  background: T.text.primary,
                  border:     `2px solid ${T.bg.card}`,
                }}
              />
            </div>
          </div>

          {/* Timeline labels */}
          <div className="flex justify-between">
            <span className="text-[8px] tracking-widest" style={{ color: T.text.micro }}>
              NOV 1 · 06:00
            </span>
            <span className="text-[8px] tracking-widest font-bold" style={{ color: T.cascade.bg }}>
              CASCADE +{cascadeHour}h
            </span>
            <span className="text-[8px] tracking-widest" style={{ color: T.text.micro }}>
              NOV 3 · PEAK
            </span>
            <span className="text-[8px] tracking-widest" style={{ color: T.text.micro }}>
              NOV 4 · RECOVERY
            </span>
          </div>
        </div>

        {/* Completed banner */}
        {replay.completed && (
          <div className="flex items-center justify-between px-4 py-2"
            style={{ background: T.bg.surface, border: `1px solid ${T.border.subtle}` }}>
            <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.secondary }}>
              ✓ Replay complete — GHOSTNET fired {41}h before real emergency
            </span>
            <button onClick={handleReset}
              className="text-[9px] tracking-widest uppercase px-3 py-1"
              style={{ border: `1px solid ${T.border.default}`, color: T.text.primary, background: 'transparent', fontFamily: T.font.mono }}>
              REPLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Cascade bar — uses local replay state */}
      <ReplayCascadeBar cascade={state.cascade} onClear={() => dispatch({ type: 'CLEAR' })} />

      {/* Agent cards — replay state */}
      <div className="grid grid-cols-3 gap-4">
        <ReplayAgentCard signal={state.signals.air_quality} cascade={state.cascade} />
        <ReplayAgentCard signal={state.signals.transport}   cascade={state.cascade} />
        <ReplayAgentCard signal={state.signals.sentiment}   cascade={state.cascade} />
      </div>

      {/* Signal feed */}
      <div style={{ border: `1px solid ${T.border.default}` }}>
        <ReplayFeed feed={state.feed} />
      </div>
    </div>
  );
}

// ── Local CascadeBar for replay (doesn't affect live context) ──
function ReplayCascadeBar({ cascade, onClear }) {
  if (!cascade) {
    return (
      <div className="flex items-center gap-4 px-4 py-3"
        style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
        <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
          CASCADE DETECTOR
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-[5px] h-[5px] rounded-full"
            style={{ background: T.text.muted, animation: 'pulse-dot 2.5s infinite' }} />
          <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.secondary }}>
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
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: T.cascade.text }}>
          ▲ CASCADE DETECTED — {cascade.hoursUntil}H BEFORE PEAK
        </span>
        <button onClick={onClear}
          className="text-[9px] tracking-widest uppercase px-3 py-1"
          style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text, background: 'transparent', fontFamily: T.font.mono }}>
          CLEAR
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'CONFIDENCE',   value: `${cascade.confidence}%`  },
          { label: 'PREDICTED',    value: cascade.predictedEvent     },
          { label: 'HOURS UNTIL',  value: `~${cascade.hoursUntil}h` },
          { label: 'ACTION',       value: cascade.recommendation     },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-[8px] tracking-widest uppercase" style={{ color: 'rgba(252,250,245,0.40)' }}>{s.label}</span>
            <span className="text-[10px] font-bold leading-tight" style={{ color: T.cascade.text }}>{s.value}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes cascade-pulse { 0%,100%{opacity:1} 50%{opacity:0.88} }`}</style>
    </div>
  );
}

// ── Local AgentCard for replay (no live context dependency) ──
function ReplayAgentCard({ signal, cascade }) {
  if (!signal) return null;
  const AGENT_META = {
    air_quality: { label: 'AIR QUALITY', source: 'CPCB / OpenAQ' },
    transport:   { label: 'TRANSPORT',   source: 'DMRC / TomTom'  },
    sentiment:   { label: 'SENTIMENT',   source: 'Twitter Archive' },
  };
  const meta         = AGENT_META[signal.agentId];
  const cascadeActive = !!cascade;
  const triggered     = cascade?.agentsTriggered?.includes(signal.agentId);
  const isCritical    = signal.anomalyLevel === 'critical';

  const cardBg   = cascadeActive ? T.cascade.bg   : isCritical ? T.severity.critical.bg   : T.bg.card;
  const cardText = cascadeActive ? T.cascade.text  : isCritical ? T.severity.critical.text : T.text.primary;
  const subColor = cascadeActive ? 'rgba(252,250,245,0.50)' : isCritical ? 'rgba(252,250,245,0.5)' : T.text.secondary;
  const microColor = cascadeActive ? 'rgba(252,250,245,0.30)' : T.text.micro;

  return (
    <div className="flex flex-col gap-3 p-4 transition-all duration-500"
      style={{
        background: cardBg,
        color:      cardText,
        border:     cascadeActive ? `2px solid ${T.cascade.border}` : isCritical ? `2px solid ${T.border.strong}` : `1px solid ${T.border.subtle}`,
        fontFamily: T.font.mono,
        animation:  cascadeActive ? 'cascade-pulse 1s ease infinite' : 'none',
      }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.25em] uppercase font-bold" style={{ color: microColor }}>
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          {cascadeActive && triggered && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
              style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text }}>
              TRIGGERED
            </span>
          )}
          <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase"
            style={{ border: `1px solid ${cascadeActive ? T.cascade.text : T.border.default}`, color: cascadeActive ? T.cascade.text : cardText }}>
            {signal.anomalyLevel.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold" style={{ color: cardText }}>{signal.healthScore}</span>
        <span className="text-sm" style={{ color: subColor }}>/100</span>
      </div>
      <div className="w-full h-[2px]" style={{ background: cascadeActive ? 'rgba(252,250,245,0.15)' : T.border.subtle }}>
        <div className="h-full transition-all duration-700"
          style={{ width: `${100 - signal.healthScore}%`, background: cardText }} />
      </div>
      <p className="text-[10px] leading-relaxed" style={{ color: subColor }}>{signal.signal}</p>
      <div className="flex justify-between">
        <span className="text-[9px] uppercase" style={{ color: microColor }}>/{meta.source}</span>
        <span className="text-[9px]" style={{ color: microColor }}>
          {new Date(signal.timestamp).toLocaleString('en-IN', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ── Replay signal feed ────────────────────────────────────
function ReplayFeed({ feed }) {
  const ABBR = { air_quality: 'AQ', transport: 'TR', sentiment: 'SN' };
  return (
    <div style={{ fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
          REPLAY SIGNAL LOG
        </span>
        <span className="text-[9px]" style={{ color: T.text.micro }}>{feed.length} signals processed</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
        {feed.length === 0 && (
          <div className="px-4 py-4 text-center">
            <span className="text-[9px] tracking-widest" style={{ color: T.text.micro }}>
              Hit PLAY to start processing signals
            </span>
          </div>
        )}
        {feed.map((sig, i) => (
          <div key={`${sig.agentId}-${sig.timestamp}-${i}`}
            className="flex items-center gap-3 px-4 py-2"
            style={{ borderBottom: `1px solid ${T.border.subtle}`, background: i === 0 ? T.bg.surface : 'transparent', animation: i === 0 ? 'row-in 0.2s ease' : 'none' }}>
            <span className="text-[9px] font-bold w-6" style={{ color: sig.anomalyLevel === 'critical' ? T.text.primary : T.text.muted }}>
              {ABBR[sig.agentId]}
            </span>
            <span className="w-[4px] h-[4px] rounded-full" style={{ background: sig.anomalyLevel === 'critical' ? T.border.strong : T.border.default }} />
            <span className="text-[10px] flex-1 truncate" style={{ color: T.text.secondary }}>{sig.signal}</span>
            <span className="text-[9px]" style={{ color: T.text.micro }}>
              {new Date(sig.timestamp).toLocaleString('en-IN', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes row-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}