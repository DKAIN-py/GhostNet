import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

export default function CascadeBar() {
  const { cascade, fireFakeCascade, clearCascade } = useGhostnet();

  if (!cascade) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3"
        style={{ border: `1px solid ${T.border.default}`, fontFamily: T.font.mono, background: T.bg.card }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
            CASCADE DETECTOR
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-[5px] h-[5px] rounded-full"
              style={{ background: T.text.muted, animation: 'pulse-dot 2.5s infinite' }}
            />
            <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.secondary }}>
              NOMINAL — MONITORING
            </span>
          </span>
        </div>
        <button
          onClick={fireFakeCascade}
          className="text-[10px] tracking-widest uppercase px-3 py-1.5 transition-all self-start sm:self-auto"
          style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface, fontFamily: T.font.mono }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.bg.surface)}
        >
          ⚡ FIRE TEST CASCADE
        </button>
        <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    );
  }

  const recPreview = cascade.recommendations?.length
    ? `${cascade.recommendations[0]}${cascade.recommendations.length > 1 ? ` (+${cascade.recommendations.length - 1})` : ''}`
    : '—';

  return (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      style={{ background: T.cascade.bg, border: `2px solid ${T.cascade.border}`, fontFamily: T.font.mono, animation: 'cascade-pulse 1s ease infinite' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: 'rgba(252,250,245,0.4)' }}>
            CASCADE DETECTOR
          </span>
          <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: T.cascade.text }}>
            ▲ ALERT FIRED{cascade.primarySectorName ? ` · ${cascade.primarySectorName}` : ''}
          </span>
        </div>
        <button
          onClick={clearCascade}
          className="text-[10px] tracking-widest uppercase px-3 py-1 font-bold self-start sm:self-auto"
          style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text, background: 'transparent', fontFamily: T.font.mono }}
        >
          CLEAR
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <CascadeStat label="CONFIDENCE" value={`${cascade.confidence}%`} />
        <CascadeStat label="PREDICTED EVENT" value={cascade.predictedEvent} />
        <CascadeStat label="HOURS UNTIL PEAK" value={`~${cascade.hoursUntil}h`} />
        <CascadeStat label="RECOMMENDATION" value={recPreview} />
      </div>

      <style>{`
        @keyframes cascade-pulse {
          0%,100% { opacity: 1;   }
          50%     { opacity: 0.88; }
        }
      `}</style>
    </div>
  );
}

function CascadeStat({ label, value }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[8px] tracking-widest uppercase" style={{ color: 'rgba(252,250,245,0.4)' }}>
        {label}
      </span>
      <span className="text-[11px] font-bold leading-tight truncate" style={{ color: T.cascade.text }} title={String(value)}>
        {value}
      </span>
    </div>
  );
}