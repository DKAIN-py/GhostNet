import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

export default function SectorCascadePanel({ cascades }) {
  const navigate = useNavigate();
  const { acknowledgeCascade } = useGhostnet();
  const list = cascades || [];

  const [expandedId, setExpandedId] = useState(null);

  function toggle(sectorId) {
    setExpandedId((prev) => (prev === sectorId ? null : sectorId));
  }

  // acknowledgeCascade() dispatches into shared context state — the moment
  // this fires, `cascades` updates for every component reading it (this
  // panel, Dashboard, CascadeLog, SectorDetail's cascade banner,
  // NervousSystem), not just this one list.
  function handleAcknowledge(sectorId) {
    acknowledgeCascade(sectorId);
    setExpandedId((prev) => (prev === sectorId ? null : prev));
  }

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
          SECTOR CASCADES
        </span>
        <span className="text-[10px]" style={{ color: T.text.micro }}>{list.length} / 39 active</span>
      </div>

      {list.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            No sector cascades active
          </span>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {list.map((c) => {
            const isOpen = expandedId === c.primarySectorId;
            return (
              <div key={c.primarySectorId} style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                {/* Collapsed row */}
                <button
                  onClick={() => toggle(c.primarySectorId)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-all"
                  style={{ background: isOpen ? T.bg.surface : 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
                  onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = T.bg.hover; }}
                  onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-[11px] shrink-0" style={{ color: T.severity.critical.border }}>▲</span>
                    <div className="min-w-0">
                      <span className="text-[11px] tracking-wide uppercase font-bold block truncate" style={{ color: T.text.primary }}>
                        {c.primarySectorName || c.primarySectorId}
                      </span>
                      <span className="text-[10px] truncate block mt-0.5" style={{ color: T.text.micro }}>
                        {c.predictedEvent} · {c.confidence}% confidence
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-bold" style={{ color: T.text.primary }}>{Math.round(c.cascadeScore * 100)}</span>
                    <span className="text-[10px]" style={{ color: T.text.micro }}>{isOpen ? '▾' : '▸'}</span>
                  </div>
                </button>

                {/* Expanded detail — full incident info + actions */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-3" style={{ background: T.bg.surface }}>
                    <div className="grid grid-cols-2 gap-px" style={{ background: T.border.subtle }}>
                      <MiniStat label="HOURS UNTIL PEAK" value={`~${c.hoursUntil}h`} />
                      <MiniStat label="DISTRICT" value={c.district || '—'} />
                    </div>

                    {c.triggeredAgents?.length > 0 && (
                      <div>
                        <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>Contributing Signals</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.triggeredAgents.map((a) => (
                            <span key={a} className="text-[9px] tracking-wider uppercase px-2 py-1" style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.card }}>
                              {a.replaceAll('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.spatialSpread?.length > 0 && (
                      <div>
                        <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>Sectors In Path</span>
                        <p className="text-[11px] leading-relaxed mt-1" style={{ color: T.text.secondary }}>{c.spatialSpread.join(' → ')}</p>
                      </div>
                    )}

                    {c.recommendations?.length > 0 && (
                      <div>
                        <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>Recommended Actions</span>
                        <ul className="flex flex-col gap-1 mt-1.5 m-0 p-0" style={{ listStyle: 'none' }}>
                          {c.recommendations.map((rec, i) => (
                            <li key={i} className="text-[11px] leading-relaxed flex gap-2" style={{ color: T.text.primary }}>
                              <span style={{ color: T.text.muted }}>{i + 1}.</span>{rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => navigate(`/sectors/${c.primarySectorId}`)}
                        className="text-[10px] tracking-widest uppercase px-3.5 py-2 font-bold transition-all"
                        style={{ border: `1px solid ${T.border.strong}`, color: T.bg.card, background: T.border.strong, fontFamily: T.font.mono, cursor: 'pointer' }}
                      >
                        Visit Sector →
                      </button>
                      <button
                        onClick={() => handleAcknowledge(c.primarySectorId)}
                        className="text-[10px] tracking-widest uppercase px-3.5 py-2 font-bold transition-all"
                        style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}
                      >
                        Acknowledge &amp; Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: T.bg.card }}>
      <span className="text-[8px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-[12px] font-bold" style={{ color: T.text.primary }}>{value}</span>
    </div>
  );
}