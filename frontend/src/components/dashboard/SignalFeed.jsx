import { useGhostnet } from '../../context/GhostnetContext';
import { T, getSeverityStyle } from '../../lib/theme';

function abbr(agentId) {
  if (!agentId) return '??';
  return agentId.split('_').map((w) => w[0]).join('').toUpperCase().slice(0, 3);
}

export default function SignalFeed({ sectorId = null, limit = 50, title = 'LIVE SIGNAL FEED' }) {
  const { feed } = useGhostnet();

  const rows = (sectorId ? feed.filter((f) => f.sectorId === sectorId) : feed).slice(0, limit);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>{title}</span>
        <span className="text-[10px]" style={{ color: T.text.micro }}>{rows.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: sectorId ? '220px' : '280px' }}>
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center">
            <span className="text-[10px] tracking-widest" style={{ color: T.text.micro }}>No signals yet</span>
          </div>
        )}

        {rows.map((sig, i) => {
          const sev = getSeverityStyle(sig.anomalyLevel === 'warning' ? 'moderate' : sig.anomalyLevel);
          const isCritical = sig.anomalyLevel === 'critical';
          return (
            <div
              key={`${sig.sectorId}-${sig.agentId}-${sig.timestamp}-${i}`}
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5"
              style={{ borderBottom: `1px solid ${T.border.subtle}`, background: i === 0 ? T.bg.surface : 'transparent', animation: i === 0 ? 'row-in 0.3s ease' : 'none' }}
            >
              <span className="text-[10px] tracking-widest font-bold w-8 shrink-0" style={{ color: isCritical ? T.text.primary : T.text.muted }} title={sig.agentId}>
                {abbr(sig.agentId)}
              </span>
              <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: sev.border }} />
              <span className="text-[11px] flex-1 truncate" style={{ color: T.text.secondary }}>
                {sig.signal}
                {!sectorId && <span className="ml-1 hidden sm:inline" style={{ color: T.text.micro }}>· {sig.sectorId} · {sig.anomalyLevel?.toUpperCase()}</span>}
              </span>
              <span className="text-[10px] shrink-0 hidden sm:inline" style={{ color: T.text.micro }}>
                {new Date(sig.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
              </span>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes row-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}