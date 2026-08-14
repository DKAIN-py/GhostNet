import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { useMockStream } from '../hooks/useMockStream';
import { useSparklineData } from '../hooks/useSparklineData';
import { T } from '../lib/theme';
import { SECTORS, SECTOR_BY_ID } from '../lib/sectors';
import { AGENT_META } from '../lib/schema';
import AgentCard from '../components/dashboard/AgentCard';
import SectorCard from '../components/dashboard/SectorCard';
import SignalFeed from '../components/dashboard/SignalFeed';
import SchemaPanel from '../components/dashboard/SchemaPanel';
import CascadeBar from '../components/dashboard/CascadeBar';

export default function Dashboard() {
  const {
    allSignals,
    sectorHealth,
    networkStats,
    cascades,
    feed,
    connected,
    pushMockSignal,
    recomputeCascade,
  } = useGhostnet();

  useMockStream(4000);
  const sparklines = useSparklineData();
  const navigate = useNavigate();

  const [expandedSector, setExpandedSector] = useState(null);

  // ------------------------------------------------------------
  // Signals grouped by sector — powers each sector's expansion panel
  // ------------------------------------------------------------
  const signalsBySector = useMemo(() => {
    const map = {};
    (allSignals || []).forEach((s) => {
      const id = s.sectorId || 'UNKNOWN';
      if (!map[id]) map[id] = [];
      map[id].push(s);
    });
    return map;
  }, [allSignals]);

  // Kept in a ref so the jitter interval below can always read the latest
  // grouping WITHOUT that interval being torn down every time any signal
  // anywhere in the 468-signal mesh changes (which is what was silently
  // starving it before — signalsBySector gets a new reference on every
  // mesh tick, and having it in a useEffect dependency array meant the
  // interval rarely survived long enough to fire).
  const signalsBySectorRef = useRef(signalsBySector);
  useEffect(() => {
    signalsBySectorRef.current = signalsBySector;
  }, [signalsBySector]);

  // ------------------------------------------------------------
  // 39-sector list merged with health rollup, risk-sorted
  // ------------------------------------------------------------
  const sectorList = useMemo(() => {
    return SECTORS.map((sector) => {
      const health = sectorHealth?.[sector.sectorId];
      const riskScore = health ? Math.max(0, 100 - health.minHealthScore) : 0;
      const nonNominal = health ? health.criticalCount + health.warningCount : 0;
      return { sector, health, riskScore, nonNominal };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [sectorHealth]);

  const sectorsAtRisk = sectorList.filter((s) => s.nonNominal > 0).length;
  const cityRisk = Math.round(100 - (networkStats?.avgHealthScore ?? 100));

  const signalsPerMin = useMemo(() => {
    const cutoff = Date.now() - 60000;
    return (feed || []).filter((f) => new Date(f.timestamp).getTime() >= cutoff).length;
  }, [feed]);

  // ------------------------------------------------------------
  // Top threats — real multi-cascades first, falls back to the
  // worst individual signals if the mesh is quiet
  // ------------------------------------------------------------
  const topThreats = useMemo(() => {
    if (cascades?.length) {
      return cascades.slice(0, 5).map((c) => ({
        id: c.alertId,
        label: c.predictedEvent || 'Cascade risk',
        score: Math.round(c.cascadeScore * 100),
        from: c.primarySectorName || SECTOR_BY_ID[c.primarySectorId]?.name || c.primarySectorId,
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

  // ------------------------------------------------------------
  // Offline jitter — keeps the expanded sector's sparklines alive
  // when there's no live socket. Fixed to depend only on stable
  // values (connected, expandedSector, the two callbacks) so it
  // reliably fires every 2500ms instead of being reset by every
  // unrelated signal update elsewhere in the mesh.
  // ------------------------------------------------------------
  useEffect(() => {
    if (connected || !expandedSector) return;

    const timer = setInterval(() => {
      const targets = signalsBySectorRef.current[expandedSector] || [];
      targets.forEach((sig) => {
        const delta = Math.round((Math.random() - 0.5) * 6); // -3..+3
        const healthScore = Math.max(3, Math.min(97, sig.healthScore + delta));
        const anomalyLevel = healthScore < 35 ? 'critical' : healthScore < 60 ? 'warning' : 'nominal';
        pushMockSignal({ ...sig, healthScore, anomalyLevel, timestamp: new Date().toISOString() });
      });
      recomputeCascade();
    }, 2500);

    return () => clearInterval(timer);
  }, [connected, expandedSector, pushMockSignal, recomputeCascade]);

  function handleToggleSector(sectorId) {
    setExpandedSector((prev) => (prev === sectorId ? null : sectorId));
  }

  function handleViewOnMap(sectorId) {
    navigate('/citymap', { state: { focusSectorId: sectorId } });
  }

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      {/* Header */}
      <div>
        <h1 className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.text.primary }}>
          GHOSTNET
        </h1>
        <p className="text-[10px] tracking-widest mt-0.5 uppercase" style={{ color: T.text.micro }}>
          Live City Status · 39 sectors · 12 agents · {networkStats?.signalCount ?? 0} signals
        </p>
      </div>

      {/* Top stat bar */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px"
        style={{ background: T.border.subtle, border: `1px solid ${T.border.default}` }}
      >
        <StatBlock label="CITY RISK" value={cityRisk} alert={cityRisk >= 60} />
        <StatBlock label="ACTIVE CASCADES" value={cascades?.length ?? 0} alert={(cascades?.length ?? 0) > 0} />
        <StatBlock label="SECTORS AT RISK" value={`${sectorsAtRisk} / ${SECTORS.length}`} alert={sectorsAtRisk > 0} />
        <StatBlock label="SIGNALS/MIN" value={signalsPerMin} />
      </div>

      {/* Cascade detector + fire test cascade */}
      <CascadeBar />

      {/* Top threats + live intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: `1px solid ${T.border.subtle}` }}
          >
            <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
              TOP THREATS
            </span>
            <span className="text-[9px]" style={{ color: T.text.micro }}>{topThreats.length}</span>
          </div>

          {topThreats.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
                Mesh nominal — no active threats
              </span>
            </div>
          ) : (
            topThreats.map((t) => (
              <button
                key={t.id}
                onClick={() => t.sectorId && setExpandedSector(t.sectorId)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-all"
                style={{ borderBottom: `1px solid ${T.border.subtle}`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="min-w-0">
                  <span
                    className="text-[10px] tracking-widest uppercase font-bold block truncate"
                    style={{ color: T.severity.critical.bg }}
                  >
                    ▲ {t.label}
                  </span>
                  <span className="text-[9px] truncate block mt-0.5" style={{ color: T.text.micro }}>
                    {t.from}{t.to ? ` → ${t.to}` : ''}
                  </span>
                </div>
                <span className="text-xl font-bold shrink-0" style={{ color: T.text.primary }}>{t.score}</span>
              </button>
            ))
          )}
        </div>

        <div style={{ border: `1px solid ${T.border.default}` }}>
          <SignalFeed />
        </div>
      </div>

      {/* Sector grid — all 39, click to expand */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
            SECTORS REQUIRING ATTENTION
          </span>
          <span className="text-[9px] tracking-widest" style={{ color: T.text.micro }}>
            {sectorList.length} sectors monitored
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {sectorList.map(({ sector, health, riskScore, nonNominal }) => (
            <SectorCard
              key={sector.sectorId}
              sector={sector}
              health={health}
              riskScore={riskScore}
              nonNominal={nonNominal}
              expanded={expandedSector === sector.sectorId}
              onToggle={() => handleToggleSector(sector.sectorId)}
            />
          ))}
        </div>
      </div>

      {/* Expanded sector — all 12 agents for that sector */}
      {expandedSector && (
        <SectorDetail
          sectorId={expandedSector}
          signals={signalsBySector[expandedSector] || []}
          sparklines={sparklines}
          onClose={() => setExpandedSector(null)}
          onViewMap={() => handleViewOnMap(expandedSector)}
        />
      )}

      <div style={{ border: `1px solid ${T.border.default}` }}>
        <SchemaPanel />
      </div>
    </div>
  );
}

function StatBlock({ label, value, alert }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4" style={{ background: T.bg.card }}>
      <span className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-2xl font-bold" style={{ color: alert ? T.severity.critical.bg : T.text.primary }}>
        {value}
      </span>
    </div>
  );
}

function SectorDetail({ sectorId, signals, sparklines, onClose, onViewMap }) {
  const sample = signals[0];

  return (
    <div className="flex flex-col gap-3 p-4" style={{ border: `2px solid ${T.border.strong}`, background: T.bg.card }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: T.text.primary }}>
            {sectorId}{sample?.location?.placeName ? ` — ${sample.location.placeName}` : ''}
          </span>
          <span className="text-[9px] tracking-widest uppercase block mt-0.5" style={{ color: T.text.micro }}>
            {sample?.district || 'UNKNOWN'} · {signals.length}/12 agents
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewMap}
            className="text-[9px] tracking-widest uppercase px-3 py-1.5 font-bold transition-all"
            style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface, fontFamily: T.font.mono, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.bg.surface)}
          >
            ⬢ VIEW ON MAP
          </button>
          <button
            onClick={onClose}
            className="text-[9px] tracking-widest uppercase px-3 py-1.5"
            style={{ border: `1px solid ${T.border.default}`, color: T.text.micro, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}
          >
            ✕ CLOSE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {signals.map((sig) => (
          <AgentCard
            key={`${sig.sectorId}-${sig.agentId}`}
            signal={sig}
            sparkline={sparklines[`${sig.sectorId}:${sig.agentId}`]}
          />
        ))}
      </div>
    </div>
  );
}