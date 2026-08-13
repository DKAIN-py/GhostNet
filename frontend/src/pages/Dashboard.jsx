import { useEffect, useMemo } from 'react';
import { useGhostnet } from '../context/GhostnetContext';
import { useMockStream } from '../hooks/useMockStream';
import { useSparklineData } from '../hooks/useSparklineData';
import { T } from '../lib/theme';
import AgentCard from '../components/dashboard/AgentCard';
import CascadeBar from '../components/dashboard/CascadeBar';
import SignalFeed from '../components/dashboard/SignalFeed';
import SchemaPanel from '../components/dashboard/SchemaPanel';

const MAX_CARDS = 12;
const JITTER_MS = 2500;

export default function Dashboard() {
  const { allSignals, networkStats, pushMockSignal, connected } = useGhostnet();
  useMockStream(4000);
  const sparklines = useSparklineData();

  // All non-nominal signals, worst health first.
  const anomalousSignals = useMemo(() => {
    return [...(allSignals || [])]
      .filter((s) => s.anomalyLevel !== 'nominal')
      .sort((a, b) => a.healthScore - b.healthScore);
  }, [allSignals]);

  const topSignals = anomalousSignals.slice(0, MAX_CARDS);

  // The mesh-wide mock stream (useMockStream) only touches 1 random signal
  // out of 468 per tick, so it's very unlikely to ever nudge one of these
  // exact cards — meaning their sparklines would sit at a single flat point
  // forever. This gently jitters specifically the signals currently on
  // screen so what's visible is what's actually moving.
  useEffect(() => {
    if (connected) return;

    const timer = setInterval(() => {
      topSignals.forEach((sig) => {
        const delta = Math.round((Math.random() - 0.5) * 6); // -3..+3
        const healthScore = Math.max(3, Math.min(97, sig.healthScore + delta));
        const anomalyLevel = healthScore < 35 ? 'critical' : healthScore < 60 ? 'warning' : 'nominal';
        pushMockSignal({ ...sig, healthScore, anomalyLevel, timestamp: new Date().toISOString() });
      });
    }, JITTER_MS);

    return () => clearInterval(timer);
    // topSignals intentionally drives this — when the visible set changes,
    // restart the jitter loop against the new set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSignals, connected, pushMockSignal]);

  return (
    <div
      className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto"
      style={{ fontFamily: T.font.mono, background: T.bg.root }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.text.primary }}>
            LIVE DASHBOARD
          </h1>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: T.text.micro }}>
            12 agents · 39 sectors · {networkStats?.signalCount ?? 0} live signals
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Stat label="CRITICAL" value={networkStats?.criticalCount ?? 0} alert={networkStats?.criticalCount > 0} />
          <Stat label="WARNING" value={networkStats?.warningCount ?? 0} />
          <Stat
            label="AVG HEALTH"
            value={networkStats?.avgHealthScore ?? 0}
            alert={(networkStats?.avgHealthScore ?? 100) < 50}
          />
          <div className="flex items-center gap-2">
            <span className="text-[9px] tracking-widest uppercase hidden sm:inline" style={{ color: T.text.micro }}>
              STREAM
            </span>
            <div className="w-14 sm:w-24 h-[1px] relative overflow-hidden" style={{ background: T.border.subtle }}>
              <div
                className="absolute top-0 left-0 h-full w-8"
                style={{ background: T.text.muted, animation: 'stream-bar 1.6s linear infinite' }}
              />
            </div>
          </div>
        </div>
      </div>

      <CascadeBar />

      {/* Top anomalies */}
      {topSignals.length === 0 ? (
        <div className="flex items-center justify-center py-10" style={{ border: `1px solid ${T.border.subtle}` }}>
          <span className="text-[10px] tracking-widest uppercase text-center px-4" style={{ color: T.text.micro }}>
            All {networkStats?.signalCount ?? 468} signals nominal — mesh quiet
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
              Showing {topSignals.length} of {anomalousSignals.length} anomalies
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topSignals.map((sig) => (
              <AgentCard
                key={`${sig.sectorId}-${sig.agentId}`}
                signal={sig}
                sparkline={sparklines[`${sig.sectorId}:${sig.agentId}`]}
              />
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={{ border: `1px solid ${T.border.default}` }}><SignalFeed /></div>
        <div style={{ border: `1px solid ${T.border.default}` }}><SchemaPanel /></div>
      </div>

      <style>{`
        @keyframes stream-bar {
          from { transform: translateX(-100%); }
          to   { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>
        {label}
      </span>
      <span className="text-[13px] font-bold" style={{ color: alert ? T.severity.critical.bg : T.text.primary }}>
        {value}
      </span>
    </div>
  );
}