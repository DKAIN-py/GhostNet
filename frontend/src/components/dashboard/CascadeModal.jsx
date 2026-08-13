import { useEffect } from 'react';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

export default function CascadeModal() {
  const { cascade, clearCascade } = useGhostnet();

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') clearCascade(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearCascade]);

  if (!cascade) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(43,40,34,0.75)' }}
        onClick={clearCascade}
      />

      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] sm:w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
        style={{
          background: T.cascade.bg,
          border: `2px solid ${T.cascade.border}`,
          fontFamily: T.font.mono,
          animation: 'modal-in 0.15s ease-out',
          willChange: 'opacity, scale',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 sm:px-6 py-4"
          style={{ borderBottom: `1px solid rgba(252,250,245,0.15)` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: T.cascade.text, animation: 'blink 1s step-start infinite' }}
            />
            <span className="text-xs tracking-[0.3em] uppercase font-bold truncate" style={{ color: T.cascade.text }}>
              CASCADE DETECTED
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] tracking-widest block" style={{ color: 'rgba(252,250,245,0.40)' }}>
              {new Date(cascade.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
            </span>
            {cascade.alertId && (
              <span className="text-[8px] tracking-widest block" style={{ color: 'rgba(252,250,245,0.25)' }}>
                {cascade.alertId}
              </span>
            )}
          </div>
        </div>

        {/* Sector line */}
        {cascade.primarySectorName && (
          <div className="px-4 sm:px-6 pt-3">
            <span className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(252,250,245,0.55)' }}>
              {cascade.primarySectorName}{cascade.district ? ` · ${cascade.district}` : ''}
              {cascade.primarySectorId ? ` · ${cascade.primarySectorId}` : ''}
            </span>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px p-px mt-3" style={{ background: 'rgba(252,250,245,0.10)' }}>
          <StatBlock label="CONFIDENCE" value={`${cascade.confidence}%`} />
          <StatBlock label="HOURS UNTIL PEAK" value={`~${cascade.hoursUntil}h`} />
          <StatBlock label="PREDICTED EVENT" value={cascade.predictedEvent} large />
          <StatBlock label="AGENTS TRIGGERED" value={cascade.triggeredAgents?.join(' + ')?.toUpperCase()} />
        </div>

        {/* Spatial spread */}
        {cascade.spatialSpread?.length > 0 && (
          <div className="px-4 sm:px-6 py-3" style={{ borderTop: `1px solid rgba(252,250,245,0.10)` }}>
            <p className="text-[9px] tracking-[0.2em] uppercase mb-1.5" style={{ color: 'rgba(252,250,245,0.40)' }}>
              SPATIAL SPREAD
            </p>
            <p className="text-[11px]" style={{ color: T.cascade.text }}>
              {cascade.spatialSpread.join(', ')}
            </p>
          </div>
        )}

        {/* Recommendations */}
        <div
          className="px-4 sm:px-6 py-4"
          style={{ borderTop: `1px solid rgba(252,250,245,0.10)`, borderBottom: `1px solid rgba(252,250,245,0.10)` }}
        >
          <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'rgba(252,250,245,0.40)' }}>
            RECOMMENDATIONS
          </p>
          <ul className="flex flex-col gap-1.5 m-0 p-0" style={{ listStyle: 'none' }}>
            {(cascade.recommendations ?? []).map((rec, i) => (
              <li key={i} className="text-sm font-bold leading-relaxed flex gap-2" style={{ color: T.cascade.text }}>
                <span style={{ opacity: 0.5 }}>→</span>{rec}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 gap-3">
          <span className="text-[9px] tracking-widest uppercase hidden sm:inline" style={{ color: 'rgba(252,250,245,0.30)' }}>
            ESC to dismiss
          </span>
          <button
            onClick={clearCascade}
            className="text-[11px] tracking-widest uppercase px-5 py-2 font-bold transition-all w-full sm:w-auto"
            style={{
              border: `1px solid ${T.cascade.text}`,
              color: T.cascade.bg,
              background: T.cascade.text,
              fontFamily: T.font.mono,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = T.cascade.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = T.cascade.text;
              e.currentTarget.style.color = T.cascade.bg;
            }}
          >
            ACKNOWLEDGE &amp; CLEAR
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; scale: 0.96; }
          to   { opacity: 1; scale: 1;    }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </>
  );
}

function StatBlock({ label, value, large = false }) {
  return (
    <div className="flex flex-col gap-1 px-4 sm:px-6 py-4" style={{ background: T.cascade.bg }}>
      <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: 'rgba(252,250,245,0.40)' }}>
        {label}
      </span>
      <span className={`font-bold leading-tight break-words ${large ? 'text-lg' : 'text-2xl'}`} style={{ color: T.cascade.text }}>
        {value}
      </span>
    </div>
  );
}