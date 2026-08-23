import { T } from '../../lib/theme';

export default function CityIncidentDrawer({ incident, onClose }) {
  if (!incident) return null;
  const m = incident.mitigationMeasures || {};

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(43,40,34,0.5)' }} onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full z-50 w-full sm:w-[440px] overflow-y-auto"
        style={{ background: T.bg.card, borderLeft: `1px solid ${T.border.default}`, fontFamily: T.font.mono, animation: 'drawer-in 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
          <span className="text-sm font-bold tracking-wide uppercase" style={{ color: T.text.primary }}>City Incident</span>
          <button onClick={onClose} className="text-[11px] font-bold" style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}>
            ✕ CLOSE
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          <div>
            <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: T.text.micro }}>{incident.incidentId}</span>
            <p className="text-[13px] leading-relaxed mt-2" style={{ color: T.text.secondary }}>{incident.summary}</p>
          </div>

          <Section title="Affected Areas">
            {incident.affectedAreas.map((a) => (
              <div key={a.primarySectorId} className="flex flex-col gap-1 py-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <span className="text-[12px] font-bold" style={{ color: T.text.primary }}>{a.district} · {a.primarySectorId}</span>
                <span className="text-[11px]" style={{ color: T.text.secondary }}>{a.affectedBy?.description}</span>
                {a.secondarySectors?.length > 0 && (
                  <span className="text-[10px]" style={{ color: T.text.micro }}>spreading to: {a.secondarySectors.join(', ')}</span>
                )}
              </div>
            ))}
          </Section>

          <Section title="Immediate Directives">
            {(m.immediateDirectives || []).map((d, i) => (
              <div key={i} className="flex items-start justify-between gap-2 py-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <span className="text-[11px] leading-relaxed" style={{ color: T.text.secondary }}>
                  {d.action} <span style={{ color: T.text.micro }}>— {d.targetAgency}</span>
                </span>
                <span className="text-[9px] tracking-widest uppercase font-bold px-1.5 py-0.5 shrink-0" style={{ border: `1px solid ${T.border.default}`, color: T.text.micro }}>
                  {d.priority?.replace('P', '').replace('_', ' ')}
                </span>
              </div>
            ))}
          </Section>

          <Section title="Traffic & Transit Rerouting">
            {(m.trafficAndTransitRerouting || []).map((r, i) => (
              <div key={i} className="py-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>{r.affectedCorridor}</span>
                <p className="text-[11px] mt-0.5" style={{ color: T.text.secondary }}>{r.bypassRoute}</p>
                <p className="text-[10px] mt-0.5" style={{ color: T.text.micro }}>{r.transitAdjustment}</p>
              </div>
            ))}
          </Section>

          <Section title="Public Advisories">
            {(m.publicAdvisories || []).map((p, i) => (
              <div key={i} className="py-2" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>{p.headline}</span>
                <p className="text-[10px] mt-0.5" style={{ color: T.text.micro }}>{p.channel}</p>
              </div>
            ))}
          </Section>
        </div>
      </div>
      <style>{`@keyframes drawer-in { from{transform:translateX(24px); opacity:0;} to{transform:translateX(0); opacity:1;} }`}</style>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <span className="text-[10px] tracking-[0.15em] uppercase font-bold" style={{ color: T.text.secondary }}>{title}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}