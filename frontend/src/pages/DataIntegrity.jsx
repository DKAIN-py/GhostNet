import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { AGENT_META } from '../lib/schema';
import { T } from '../lib/theme';

// ─────────────────────────────────────────────────────────
// DATA INTEGRITY — dedicated dashboard
//
// Reads ONLY existing context state: dataIntegrity, networkStats, feed.
// No mock data, no fabricated counts, no synthetic history beyond a
// local session log of REAL status transitions observed while this
// page is mounted. Recovery is never simulated — it only reflects
// dataIntegrity.status actually changing degraded -> healthy, which
// only happens when a real valid agent-signal arrives (handled
// entirely inside GhostnetContext's existing reducer).
//
// The validation gate below is now REACTIVE to dataIntegrity.status,
// but reactive only means "which branch is visually emphasized" —
// it never renders per-stage telemetry that wasn't actually observed.
// ─────────────────────────────────────────────────────────

export default function DataIntegrity() {
  const { dataIntegrity, networkStats, feed } = useGhostnet();
  const navigate = useNavigate();

  const status = dataIntegrity?.status || 'healthy';
  const isDegraded = status === 'degraded';
  const issue = dataIntegrity?.latestIssue;
  const latestSignal = feed?.[0];

  // ── Session-local history + "ever degraded" tracking ──
  // Derived only from REAL transitions of dataIntegrity.status as this
  // component observes them while mounted — never generated on load,
  // never timer-driven. This is explicitly a frontend-observed session
  // log, not a backend audit trail (the backend owns dataIntegrity.rejected,
  // the real running total, already).
  const [everDegraded, setEverDegraded] = useState(isDegraded);
  const [events, setEvents] = useState([]);
  const [justRecovered, setJustRecovered] = useState(false);
  const prevStatusRef = useRef(status);
  const recoveryTimeoutRef = useRef(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = status;

    if (current === 'degraded' && prev !== 'degraded') {
      setEverDegraded(true);
      setJustRecovered(false);
      setEvents((log) => [
        {
          id: `${Date.now()}-rej`,
          time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          type: 'REJECTED',
          agentId: issue?.agentId,
          sectorId: issue?.sectorId,
          reason: issue?.reason,
        },
        ...log,
      ].slice(0, 30));
    }

    if (current === 'healthy' && prev === 'degraded') {
      setEvents((log) => [
        {
          id: `${Date.now()}-rec`,
          time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          type: 'RECOVERED',
        },
        ...log,
      ].slice(0, 30));

      // Purely a CSS-class flag for a one-shot recovery sweep animation
      // on elements that are about to render. It does not alter any
      // status text, numbers, or timing of the real state transition —
      // the transition already happened before this runs.
      setJustRecovered(true);
      clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = setTimeout(() => setJustRecovered(false), 1600);
    }

    prevStatusRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => () => clearTimeout(recoveryTimeoutRef.current), []);

  const statusLabel = isDegraded ? 'DEGRADED' : everDegraded ? 'RESTORED' : 'OPERATIONAL';
  const statusAccent = isDegraded ? T.severity.critical.border : T.severity.good.border;
  const statusBg = isDegraded ? T.severity.critical.bg : everDegraded ? T.severity.good.bg : T.bg.card;
  const statusText = isDegraded ? T.severity.critical.text : everDegraded ? T.severity.good.text : T.text.primary;

  const nextStep = isDegraded
    ? {
        title: 'Await next validated telemetry cycle.',
        body: 'The rejected record was blocked before it could mutate live state. Normal processing resumes automatically on the next valid signal.',
      }
    : everDegraded
    ? {
        title: 'Continue normal telemetry processing.',
        body: 'Live state is synchronized with the latest validated signal. No action required.',
      }
    : {
        title: 'Monitoring live telemetry stream.',
        body: 'No integrity failure has occurred in this session. Every incoming signal is validated before it can reach live state.',
      };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ============================================================
          HEADER
      ============================================================ */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-[10px] tracking-widest uppercase mb-2"
            style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
          >
            ← Back
          </button>
          <h1 className="text-xl sm:text-2xl tracking-[0.08em] uppercase font-bold" style={{ color: T.text.primary }}>
            Data Integrity
          </h1>
          <p className="text-[10px] tracking-[0.15em] uppercase mt-1" style={{ color: T.text.micro }}>
            Telemetry Validation &amp; Recovery
          </p>
          <p className="text-[11px] leading-relaxed mt-2 max-w-xl" style={{ color: T.text.secondary }}>
            Invalid telemetry is rejected at the ingestion boundary before it can affect downstream city intelligence.
          </p>
        </div>
      </div>

      {/* ============================================================
          SYSTEM STATUS — the only place live status is reflected
      ============================================================ */}
      <div
        className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-6 overflow-hidden"
        style={{ background: statusBg, border: `1px solid ${statusAccent}` }}
      >
        {/* faint scanline texture — purely decorative, static, no fake activity implied */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${statusAccent} 0px, ${statusAccent} 1px, transparent 1px, transparent 3px)`,
          }}
        />

        <div className="relative">
          <span className="text-[9px] tracking-[0.2em] uppercase font-bold" style={{ color: isDegraded ? 'rgba(252,237,232,0.6)' : T.text.micro }}>
            SYSTEM STATUS
          </span>
          <div className="flex items-center gap-3 mt-1">
            <span className="relative flex items-center justify-center" style={{ width: 12, height: 12 }}>
              <span
                className="absolute inline-block rounded-full"
                style={{
                  width: 12,
                  height: 12,
                  background: statusAccent,
                  opacity: 0.35,
                  animation: isDegraded ? 'di-ring 1.4s ease-out infinite' : 'none',
                }}
              />
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{
                  background: statusAccent,
                  animation: isDegraded ? 'di-pulse 1.4s ease-in-out infinite' : 'none',
                }}
              />
            </span>
            <span
              className={`text-3xl sm:text-4xl font-bold tracking-tight ${justRecovered ? 'di-sweep' : ''}`}
              style={{ color: statusText }}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-[10px] mt-2 max-w-sm" style={{ color: isDegraded ? 'rgba(252,237,232,0.7)' : T.text.secondary }}>
            {isDegraded
              ? 'Telemetry integrity issue detected. Live state has not been affected.'
              : everDegraded
              ? 'Live state resynchronized after a rejected record.'
              : 'No integrity failure has occurred in the current session.'}
          </p>
        </div>

        <div className="relative flex gap-6">
          <MiniStat label="REJECTED" value={dataIntegrity?.rejected ?? 0} accent={statusAccent} dark={isDegraded} />
          <MiniStat label="LIVE TELEMETRY" value={networkStats?.signalCount ?? 0} accent={statusAccent} dark={isDegraded} />
        </div>
      </div>

      {/* ============================================================
          INCIDENT NOTIFICATION — only renders while genuinely degraded,
          built from real dataIntegrity.latestIssue fields only
      ============================================================ */}
      {isDegraded && issue && (
        <div className="di-slide-in" style={{ background: T.severity.critical.bg, border: `1px solid ${T.severity.critical.border}` }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid rgba(252,237,232,0.15)` }}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: T.severity.critical.text, animation: 'di-pulse 1.4s ease-in-out infinite' }}
            />
            <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.severity.critical.text }}>
              DATA INTEGRITY EVENT
            </span>
            <span className="text-[9px] tracking-widest uppercase ml-auto" style={{ color: 'rgba(252,237,232,0.55)' }}>
              TELEMETRY REJECTED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-px" style={{ background: 'rgba(252,237,232,0.12)' }}>
            <FailureField label="AGENT" value={AGENT_META[issue.agentId]?.label || issue.agentId || '—'} />
            <FailureField label="SECTOR" value={issue.sectorId || '—'} />
            <FailureField label="REASON" value={issue.reason || '—'} wide />
            <FailureField
              label="TIMESTAMP"
              value={issue.timestamp ? new Date(issue.timestamp).toLocaleTimeString('en-IN', { hour12: false }) : '—'}
            />
          </div>

          <div className="px-5 py-4 flex flex-wrap items-center gap-3" style={{ borderTop: `1px solid rgba(252,237,232,0.15)` }}>
            <span
              className="text-[9px] tracking-widest uppercase font-bold px-2 py-1"
              style={{ border: `1px solid ${T.severity.critical.text}`, color: T.severity.critical.text }}
            >
              STATE PROTECTED
            </span>
            <span className="text-[10px] tracking-wide" style={{ color: 'rgba(252,237,232,0.75)' }}>
              Normal telemetry state was not mutated.
            </span>
          </div>

          <div className="px-5 py-3" style={{ borderTop: `1px solid rgba(252,237,232,0.15)` }}>
            <span className="text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: 'rgba(252,237,232,0.55)' }}>
              NEXT STEP
            </span>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: T.severity.critical.text }}>
              {nextStep.title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(252,237,232,0.75)' }}>
              {nextStep.body}
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          RECOVERY NOTIFICATION — only renders on a REAL degraded->healthy
          transition, never simulated
      ============================================================ */}
      {!isDegraded && everDegraded && (
        <div className={justRecovered ? 'di-slide-in' : ''} style={{ background: T.severity.good.bg, border: `1px solid ${T.severity.good.border}` }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.severity.good.border}30` }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: T.severity.good.border }} />
            <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.severity.good.text }}>
              TELEMETRY RESTORED
            </span>
          </div>
          <div className="px-5 py-4 flex flex-col gap-1">
            <span className="text-[11px] font-bold" style={{ color: T.severity.good.text }}>
              LIVE STATE SYNCHRONIZED
            </span>
            {latestSignal && (
              <span className="text-[10px]" style={{ color: T.severity.good.text, opacity: 0.8 }}>
                Latest validated telemetry · {AGENT_META[latestSignal.agentId]?.label || latestSignal.agentId} · {latestSignal.sectorId}
              </span>
            )}
          </div>
          <div className="px-5 py-3" style={{ borderTop: `1px solid ${T.severity.good.border}30` }}>
            <span className="text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: T.severity.good.text, opacity: 0.7 }}>
              NEXT STEP
            </span>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: T.severity.good.text }}>
              {nextStep.title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: T.severity.good.text, opacity: 0.8 }}>
              {nextStep.body}
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          OPERATIONAL NEXT STEP — shown only when the session has never
          seen a failure, so the "current status / next step" pairing is
          always visible without inventing an incident that never happened
      ============================================================ */}
      {!isDegraded && !everDegraded && (
        <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}` }}>
          <div className="px-5 py-3">
            <span className="text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.micro }}>
              NEXT STEP
            </span>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: T.text.primary }}>
              {nextStep.title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: T.text.secondary }}>
              {nextStep.body}
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          VALIDATION GATE — architecture diagram, now reactive to the
          real dataIntegrity.status. The branch that actually happened
          is emphasized; the other is visually secondary. Nothing here
          renders per-stage telemetry that wasn't observed — it reflects
          only the single real signal: status.
      ============================================================ */}
      <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}` }}>
        <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
          <div>
            <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.micro }}>
              VALIDATION GATE
            </span>
            <span className="text-[9px] tracking-wide ml-3" style={{ color: T.text.micro }}>
              LIVE ARCHITECTURE
            </span>
          </div>
          {!isDegraded && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: T.severity.good.border, animation: 'di-pulse 1.6s ease-in-out infinite' }} />
              <span className="text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: T.severity.good.border }}>LIVE</span>
            </span>
          )}
        </div>

        <div className="p-5 flex flex-col items-center gap-1">

          <PipelineBox label="AI AGENT" />
          <Arrow flowing={!isDegraded} />
          <PipelineBox label="TELEMETRY RECEIVED" />
          <Arrow flowing={!isDegraded} />
          <PipelineBox label="SCHEMA VALIDATION" emphasis pulse={isDegraded} />

          <div className="flex items-start justify-center gap-10 sm:gap-20 mt-2 w-full max-w-lg">
            {/* VALID branch — emphasized when healthy, dimmed when degraded */}
            <div className={`flex flex-col items-center gap-1 flex-1 transition-opacity duration-500 ${isDegraded ? 'opacity-35' : 'opacity-100'}`}>
              <ArrowSmall flowing={!isDegraded} />
              <PipelineBox label="VALID" small accent={T.severity.good.border} active={!isDegraded} />
              <ArrowSmall flowing={!isDegraded} />
              <PipelineBox label="STATE UPDATED" small accent={T.severity.good.border} active={!isDegraded} />
              <ArrowSmall flowing={!isDegraded} />
              <PipelineBox label="CASCADE ENGINE" small accent={T.severity.good.border} active={!isDegraded} />
              <ArrowSmall flowing={!isDegraded} />
              <PipelineBox label="CITY INTELLIGENCE" small accent={T.severity.good.border} active={!isDegraded} />
            </div>

            {/* INVALID branch — dominant and pulsing while degraded */}
            <div className={`flex flex-col items-center gap-1 flex-1 transition-opacity duration-500 ${isDegraded ? 'opacity-100' : 'opacity-40'}`}>
              <ArrowSmall />
              <PipelineBox label="INVALID" small accent={T.severity.critical.border} pulse={isDegraded} />
              <ArrowSmall />
              <PipelineBox label="REJECTED" small accent={T.severity.critical.border} pulse={isDegraded} emphasis={isDegraded} />
              <ArrowSmall />
              <PipelineBox label="STATE PROTECTED" small accent={T.severity.critical.border} pulse={isDegraded} />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          METRICS — all real values, no derived/subtracted figures
      ============================================================ */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px"
        style={{ background: T.border.subtle, border: `1px solid ${T.border.default}` }}
      >
        <MetricBlock
          label="REJECTED TELEMETRY"
          sublabel="INTEGRITY METRIC"
          value={dataIntegrity?.rejected ?? 0}
          accent={T.severity.critical.border}
        />
        <MetricBlock
          label="LIVE TELEMETRY"
          sublabel="APPLICATION STATE"
          value={networkStats?.signalCount ?? 0}
        />
        <MetricBlock
          label="CRITICAL SIGNALS"
          sublabel="APPLICATION STATE"
          value={networkStats?.criticalCount ?? 0}
          accent={(networkStats?.criticalCount ?? 0) > 0 ? T.severity.critical.border : undefined}
        />
        <MetricBlock
          label="WARNING SIGNALS"
          sublabel="APPLICATION STATE"
          value={networkStats?.warningCount ?? 0}
          accent={(networkStats?.warningCount ?? 0) > 0 ? T.severity.moderate.text : undefined}
        />
      </div>

      {/* ============================================================
          RECENT EVENTS — explicitly labeled as a frontend session
          observation, not a backend audit log
      ============================================================ */}
      <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}` }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.micro }}>
            RECENT EVENTS
          </span>
          <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            FRONTEND-OBSERVED · THIS SESSION ONLY
          </span>
        </div>

        {events.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
              NO VALIDATION EVENTS IN CURRENT SESSION
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {events.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-4 px-5 py-2.5 ${i === 0 ? 'di-row-in' : ''}`}
                style={{ borderBottom: `1px solid ${T.border.subtle}` }}
              >
                <span className="text-[9px] tracking-wider shrink-0" style={{ color: T.text.micro, width: 64 }}>
                  {e.time}
                </span>
                <span
                  className="text-[9px] tracking-widest uppercase font-bold px-1.5 py-0.5 shrink-0"
                  style={{
                    border: `1px solid ${e.type === 'REJECTED' ? T.severity.critical.border : T.severity.good.border}`,
                    color: e.type === 'REJECTED' ? T.severity.critical.border : T.severity.good.border,
                  }}
                >
                  {e.type}
                </span>
                {e.type === 'REJECTED' ? (
                  <span className="text-[10px]" style={{ color: T.text.secondary }}>
                    {AGENT_META[e.agentId]?.label || e.agentId || '—'} · {e.sectorId || '—'} · {e.reason || '—'}
                  </span>
                ) : (
                  <span className="text-[10px]" style={{ color: T.text.secondary }}>
                    Validated telemetry received.
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes di-pulse {
          0%, 100% { opacity: 1;   }
          50%      { opacity: 0.4; }
        }
        @keyframes di-ring {
          0%   { transform: scale(1);   opacity: 0.35; }
          100% { transform: scale(2.4); opacity: 0;    }
        }
        @keyframes di-flow {
          0%   { stroke-dashoffset: 12; }
          100% { stroke-dashoffset: 0;  }
        }
        @keyframes di-sweep {
          0%   { opacity: 0; transform: translateY(-2px); }
          100% { opacity: 1; transform: translateY(0);    }
        }
        @keyframes di-slide-in {
          0%   { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 1; transform: translateY(0);    }
        }
        .di-sweep { animation: di-sweep 0.4s ease-out; }
        .di-slide-in { animation: di-slide-in 0.35s ease-out; }
        .di-row-in { animation: di-slide-in 0.3s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .di-sweep, .di-slide-in, .di-row-in { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Small presentational helpers
============================================================ */

function MiniStat({ label, value, accent, dark }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[8px] tracking-widest uppercase font-bold" style={{ color: dark ? 'rgba(252,237,232,0.55)' : T.text.micro }}>
        {label}
      </span>
      <span className="text-xl font-bold" style={{ color: accent }}>{value}</span>
    </div>
  );
}

function MetricBlock({ label, sublabel, value, accent }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4" style={{ background: T.bg.card }}>
      <span className="text-[9px] tracking-[0.15em] uppercase font-bold" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-2xl font-bold" style={{ color: accent || T.text.primary }}>{value}</span>
      <span className="text-[8px] tracking-widest uppercase" style={{ color: T.text.micro }}>{sublabel}</span>
    </div>
  );
}

function FailureField({ label, value, wide }) {
  return (
    <div className={`flex flex-col gap-1 px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`} style={{ background: T.severity.critical.bg }}>
      <span className="text-[8px] tracking-widest uppercase font-bold" style={{ color: 'rgba(252,237,232,0.55)' }}>{label}</span>
      <span className="text-[11px] font-bold break-words" style={{ color: T.severity.critical.text }}>{value}</span>
    </div>
  );
}

// Reactive architecture nodes. `active` slightly brightens a node on the
// currently-live branch; `pulse` marks a node on the branch that just
// fired; `emphasis` bumps border weight for the single most important
// node in the invalid path (REJECTED). None of these props change what
// text is shown — only how strongly a real, already-known state is
// emphasized.
function PipelineBox({ label, small, emphasis, accent, active, pulse }) {
  const color = emphasis && !accent ? T.text.primary : (accent || T.text.secondary);
  const border = emphasis ? (accent || T.border.strong) : (accent || T.border.default);

  return (
    <div
      className={`text-center ${small ? 'px-3 py-1.5' : 'px-5 py-2'}`}
      style={{
        border: `${emphasis ? 2 : 1}px solid ${border}`,
        background: active ? `${accent}14` : T.bg.surface,
        animation: pulse ? 'di-pulse 1.4s ease-in-out infinite' : 'none',
        transition: 'background 0.4s ease, border-color 0.4s ease',
      }}
    >
      <span className={`${small ? 'text-[9px]' : 'text-[10px]'} tracking-widest uppercase font-bold`} style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function Arrow({ flowing }) {
  return (
    <span
      style={{
        color: flowing ? T.severity.good.border : T.text.micro,
        fontSize: 12,
        lineHeight: 1,
        transition: 'color 0.4s ease',
      }}
    >
      ↓
    </span>
  );
}
function ArrowSmall({ flowing }) {
  return (
    <span
      style={{
        color: flowing ? T.severity.good.border : T.text.micro,
        fontSize: 10,
        lineHeight: 1,
        transition: 'color 0.4s ease',
      }}
    >
      ↓
    </span>
  );
}