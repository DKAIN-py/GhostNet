import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../../context/GhostnetContext';
import { AGENT_META } from '../../lib/schema';
import { T } from '../../lib/theme';

// Same backend URL convention already used in GhostnetContext's
// fireFakeCascade / fireFakeCityIncident — not introducing a new one.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function JudgeDemoPanel() {
  const { fireFakeCascade, fireFakeCityIncident, dataIntegrity, feed, networkStats } = useGhostnet();
  const [open, setOpen] = useState(false);
  const [lastFired, setLastFired] = useState(null);
  const navigate = useNavigate();

  // Purely a local/cosmetic flag — never touches context state. Only
  // exists so the compact status can say "RESTORED" (just recovered)
  // instead of "OPERATIONAL" (never had an issue) once healthy again.
  const [everDegraded, setEverDegraded] = useState(false);
  const prevStatusRef = useRef(dataIntegrity?.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = dataIntegrity?.status;

    if (current === 'degraded' && prev !== 'degraded') {
      setEverDegraded(true);
      setLastFired('signal rejected — live state protected');
    }

    if (current === 'healthy' && prev === 'degraded') {
      setLastFired('telemetry restored — live state synchronized');
    }

    prevStatusRef.current = current;
  }, [dataIntegrity?.status]);

  function handleFireCascade() {
    fireFakeCascade();
    setLastFired('sector cascade fired — check Sector Cascades panel');
    setTimeout(() => setLastFired(null), 4000);
  }

  function handleFireCityIncident() {
    fireFakeCityIncident();
    setLastFired('city incident fired — check City Cascade panel');
    setTimeout(() => setLastFired(null), 4000);
  }

  async function handleTestDataIntegrity() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/demo/data-integrity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'incomplete',
          agentId: 'smog_dispersion',
          sectorId: 'DEL_EAST_LN',
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      setLastFired('integrity test submitted — waiting for validation result');
    } catch (error) {
      console.error('[GHOSTNET] /api/demo/data-integrity failed:', error);
      setLastFired('integrity test failed to reach backend');
    }
  }

  const status = dataIntegrity?.status || 'healthy';
  const isDegraded = status === 'degraded';
  const statusLabel = isDegraded ? 'DEGRADED' : everDegraded ? 'RESTORED' : 'OPERATIONAL';
  const statusAccent = isDegraded ? T.severity.critical.border : T.severity.good.border;

  const issue = dataIntegrity?.latestIssue;
  const latestSignal = feed?.[0];

  return (
    <div className="fixed bottom-3 left-3 z-30" style={{ fontFamily: T.font.mono }}>
      {open && (
        <div className="mb-2 flex flex-col gap-1.5 p-3 w-72" style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>
          <span className="text-[9px] tracking-widest uppercase font-bold mb-1" style={{ color: T.text.micro }}>Judge Demo Panel</span>

          {/* <DemoButton label="⚡ Fire Test Sector Cascade" onClick={handleFireCascade} />
          <DemoButton label="⚡ Fire Test City Incident" onClick={handleFireCityIncident} /> */}
          <DemoButton label=" Test Data Integrity" onClick={handleTestDataIntegrity} />
          <DemoButton label="Data Integrity Dashboard →" onClick={() => { navigate('/data-integrity'); setOpen(false); }} />
          <DemoButton label="Data Contract →" onClick={() => { navigate('/schema'); setOpen(false); }} />

          {lastFired && (
            <span
              className="text-[9px] tracking-wide mt-1"
              style={{ color: isDegraded ? T.severity.critical.border : T.severity.good.text }}
            >
              {isDegraded ? '⚠' : '✓'} {lastFired}
            </span>
          )}

          {/* Compact integrity status — NOTE: this used to subtract 1 from
              live signalCount when degraded, fabricating a "467/468" style
              display. A rejected telemetry packet never enters live state
              at all, so there is nothing to subtract — REJECTED and LIVE
              TELEMETRY are now shown as two separate, unmodified numbers. */}
          <div className="flex flex-col gap-1 mt-2 pt-2" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
            <div className="flex items-center justify-between">
              <span className="text-[8px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>
                DATA INTEGRITY
              </span>
              <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: statusAccent }}>
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[8px] tracking-widest uppercase" style={{ color: T.text.micro }}>REJECTED</span>
              <span className="text-[10px] font-bold" style={{ color: T.severity.critical.border }}>
                {dataIntegrity?.rejected ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[8px] tracking-widest uppercase" style={{ color: T.text.micro }}>LIVE TELEMETRY</span>
              <span className="text-[10px] font-bold" style={{ color: T.text.primary }}>
                {networkStats?.signalCount ?? 0}
              </span>
            </div>

            {/* Failure detail */}
            {isDegraded && issue && (
              <div className="flex flex-col gap-0.5 mt-1 p-2" style={{ background: T.severity.critical.bg, border: `1px solid ${T.severity.critical.border}` }}>
                <DetailRow label="AGENT" value={AGENT_META[issue.agentId]?.label || issue.agentId || '—'} />
                <DetailRow label="SECTOR" value={issue.sectorId || '—'} />
                <DetailRow label="REASON" value={issue.reason} />
                <DetailRow label="NEXT STEP" value="Await next validated telemetry cycle." />
              </div>
            )}

            {/* Recovery detail — uses the real received signal */}
            {!isDegraded && everDegraded && latestSignal && (
              <div className="flex flex-col gap-0.5 mt-1 p-2" style={{ background: T.severity.good.bg, border: `1px solid ${T.severity.good.border}` }}>
                <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: T.severity.good.text }}>
                  TELEMETRY RESTORED
                </span>
                <span className="text-[9px]" style={{ color: T.severity.good.text }}>
                  Live state synchronized · {AGENT_META[latestSignal.agentId]?.label || latestSignal.agentId} · {latestSignal.sectorId}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-widest uppercase font-bold"
        style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, cursor: 'pointer', fontFamily: T.font.mono }}
        title="Judge demo tools"
      >
         DEMO
      </button>
    </div>
  );
}

function DemoButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] tracking-widest uppercase px-2.5 py-2 text-left font-bold transition-all"
      style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface, fontFamily: T.font.mono, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = T.bg.surface)}
    >
      {label}
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[8px] tracking-widest uppercase font-bold shrink-0" style={{ color: 'rgba(252,250,245,0.55)' }}>
        {label}
      </span>
      <span className="text-[9px] font-bold text-right truncate" style={{ color: T.severity.critical.text }}>
        {value}
      </span>
    </div>
  );
}