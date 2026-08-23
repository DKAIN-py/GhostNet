import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { T } from '../lib/theme';
import { SECTORS, SECTOR_BY_ID } from '../lib/sectors';
import { AGENT_META } from '../lib/schema';
import { cityStatusStyle } from '../lib/citySeverity';
import CityCascadePanel from '../components/dashboard/CityCascadePanel';
import SectorCascadePanel from '../components/dashboard/SectorCascadePanel';
import DomainBreakdown from '../components/dashboard/DomainBreakdown';
import JudgeDemoPanel from '../components/dashboard/JudgeDemoPanel';

export default function Dashboard() {
  const { allSignals, sectorHealth, networkStats, cascades, cityIncident, feed } = useGhostnet();
  const navigate = useNavigate();

  const sectorsAtRisk = useMemo(
    () =>
      SECTORS.filter((s) => {
        const h = sectorHealth?.[s.sectorId];
        return h && h.criticalCount + h.warningCount > 0;
      }).length,
    [sectorHealth]
  );

  const cityRisk = Math.round(100 - (networkStats?.avgHealthScore ?? 100));
  // Same stable source as CityCascadePanel — a persisted, manually/backend
  // -fired incident, not the every-render live recompute — so this stat
  // block and the panel below it never disagree with each other.
  const severityStyle = cityStatusStyle(cityIncident?.citywideSeverity);

  const signalsPerMin = useMemo(() => {
    const cutoff = Date.now() - 60000;
    return (feed || []).filter((f) => new Date(f.timestamp).getTime() >= cutoff).length;
  }, [feed]);

  // Top Threats: prefer real cascades, but a cascade only exists once the
  // weighted, decayed risk across the mesh crosses CASCADE_THRESHOLD — it's
  // entirely possible (and common) to have a dozen individually flagged
  // sectors with zero cascades. Falling back to the worst raw signals means
  // this panel is never empty just because nothing has cascaded yet.
  const topThreats = useMemo(() => {
    if (cascades?.length) {
      return cascades.slice(0, 5).map((c) => ({
        id: c.alertId,
        label: c.predictedEvent || 'Cascade risk',
        score: Math.round(c.cascadeScore * 100),
        from: c.primarySectorName || c.primarySectorId,
        to: c.spatialSpread?.[0] ? (SECTOR_BY_ID[c.spatialSpread[0]]?.name || c.spatialSpread[0]) : null,
        sectorId: c.primarySectorId,
      }));
    }
    return [...(allSignals || [])]
      .filter((s) => s.anomalyLevel !== 'nominal')
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 5)
      .map((s) => ({
        id: `${s.sectorId}-${s.agentId}`,
        label: AGENT_META[s.agentId]?.label || s.agentId,
        score: 100 - s.healthScore,
        from: SECTOR_BY_ID[s.sectorId]?.name || s.sectorId,
        to: null,
        sectorId: s.sectorId,
      }));
  }, [cascades, allSignals]);

  const usingRawSignals = !cascades?.length;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      <div>
        <h1 className="text-xl sm:text-2xl tracking-[0.1em] uppercase font-bold" style={{ color: T.text.primary }}>GHOSTNET</h1>
        <p className="text-[11px] tracking-widest mt-1 uppercase" style={{ color: T.text.micro }}>
          Live City Status · 39 sectors · 12 agents · {networkStats?.signalCount ?? 0} signals · {signalsPerMin}/min
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: T.border.subtle, border: `1px solid ${T.border.default}` }}>
        <StatBlock label="CITY RISK" value={cityRisk} alert={cityRisk >= 60} />
        <StatBlock label="CITYWIDE SEVERITY" value={cityIncident?.citywideSeverity ?? 'NOMINAL'} color={severityStyle.border} />
        <StatBlock label="SECTOR CASCADES" value={cascades?.length ?? 0} alert={(cascades?.length ?? 0) > 0} />
        <StatBlock label="SECTORS AT RISK" value={`${sectorsAtRisk} / ${SECTORS.length}`} alert={sectorsAtRisk > 0} />
      </div>

      <CityCascadePanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Threats */}
        <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
            <div>
              <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>TOP THREATS</span>
              {usingRawSignals && topThreats.length > 0 && (
                <span className="text-[9px] tracking-wide block mt-0.5" style={{ color: T.text.micro }}>
                  flagged signals — none have cascaded yet
                </span>
              )}
            </div>
            <span className="text-[10px]" style={{ color: T.text.micro }}>{topThreats.length}</span>
          </div>

          {topThreats.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>Mesh nominal — no active threats</span>
            </div>
          ) : (
            topThreats.map((t) => (
              <button
                key={t.id}
                onClick={() => t.sectorId && navigate(`/sectors/${t.sectorId}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all"
                style={{ borderBottom: `1px solid ${T.border.subtle}`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="min-w-0">
                  <span className="text-[12px] tracking-wide uppercase font-bold block truncate" style={{ color: T.severity.critical.border }}>
                    ▲ {t.label}
                  </span>
                  <span className="text-[10px] truncate block mt-0.5" style={{ color: T.text.micro }}>
                    {t.from}{t.to ? ` → ${t.to}` : ''}
                  </span>
                </div>
                <span className="text-2xl font-bold shrink-0" style={{ color: T.text.primary }}>{t.score}</span>
              </button>
            ))
          )}
        </div>

        <SectorCascadePanel cascades={cascades} />
      </div>

      <DomainBreakdown signals={allSignals} />

      <JudgeDemoPanel />
    </div>
  );
}

function StatBlock({ label, value, alert, color }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4" style={{ background: T.bg.card }}>
      <span className="text-[10px] tracking-[0.15em] uppercase font-bold" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-2xl sm:text-3xl font-bold truncate" style={{ color: color || (alert ? T.severity.critical.bg : T.text.primary) }}>
        {value}
      </span>
    </div>
  );
}