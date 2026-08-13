import { useGhostnet } from '../../context/GhostnetContext';
import { T, getSeverityStyle } from '../../lib/theme';

// Dynamic 2-3 letter tag from agentId, e.g. "smog_dispersion" -> "SD",
// "hospital_capacity" -> "HC" — no hardcoded 3-agent lookup table needed.
function abbr(agentId) {
  if (!agentId) return '??';
  return agentId
    .split('_')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export default function SignalFeed() {
  const { feed } = useGhostnet();

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: T.font.mono }}>
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}
      >
        <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
          LIVE SIGNAL FEED
        </span>
        <span className="text-[9px]" style={{ color: T.text.micro }}>
          {feed.length} events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: '280px' }}>
        {feed.length === 0 && (
          <div className="px-4 py-6 text-center">
            <span className="text-[9px] tracking-widest" style={{ color: T.text.micro }}>
              No signals yet
            </span>
          </div>
        )}

        {feed.map((sig, i) => {
          const sev = getSeverityStyle(sig.anomalyLevel === 'warning' ? 'moderate' : sig.anomalyLevel);
          const isCritical = sig.anomalyLevel === 'critical';
          return (
            <div
              key={`${sig.sectorId}-${sig.agentId}-${sig.timestamp}-${i}`}
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2"
              style={{
                borderBottom: `1px solid ${T.border.subtle}`,
                background: i === 0 ? T.bg.surface : 'transparent',
                animation: i === 0 ? 'row-in 0.3s ease' : 'none',
              }}
            >
              <span
                className="text-[9px] tracking-widest font-bold w-7 shrink-0"
                style={{ color: isCritical ? T.text.primary : T.text.muted }}
                title={sig.agentId}
              >
                {abbr(sig.agentId)}
              </span>
              <span className="w-[4px] h-[4px] rounded-full shrink-0" style={{ background: sev.border }} />
              <span className="text-[10px] flex-1 truncate" style={{ color: T.text.secondary }}>
                {sig.signal}
                <span className="ml-1 hidden sm:inline" style={{ color: T.text.micro }}>
                  · {sig.sectorId} · {sig.anomalyLevel?.toUpperCase()}
                </span>
              </span>
              <span className="text-[9px] shrink-0 hidden sm:inline" style={{ color: T.text.micro }}>
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