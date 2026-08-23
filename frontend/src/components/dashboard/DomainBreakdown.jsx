import { useMemo } from 'react';
import { T, getDomainColor } from '../../lib/theme';
import { AGENT_META } from '../../lib/schema';

const DOMAINS = ['environment', 'transit', 'infrastructure', 'civic'];

export default function DomainBreakdown({ signals }) {
  const counts = useMemo(() => {
    const map = { environment: 0, transit: 0, infrastructure: 0, civic: 0 };
    (signals || []).forEach((s) => {
      if (s.anomalyLevel === 'nominal') return;
      const domain = AGENT_META[s.agentId]?.domain;
      if (domain && map[domain] !== undefined) map[domain] += 1;
    });
    return map;
  }, [signals]);

  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="flex flex-col gap-2.5 px-4 py-4" style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>ACTIVE BY DOMAIN</span>
      {DOMAINS.map((d) => (
        <div key={d} className="flex items-center gap-3">
          <span className="text-[10px] tracking-wide uppercase w-24 shrink-0" style={{ color: T.text.secondary }}>{d}</span>
          <div className="flex-1 h-2 relative overflow-hidden" style={{ background: T.border.subtle }}>
            <div className="h-full transition-all duration-500" style={{ width: `${(counts[d] / max) * 100}%`, background: getDomainColor(d) }} />
          </div>
          <span className="text-[11px] font-bold w-5 text-right shrink-0" style={{ color: T.text.primary }}>{counts[d]}</span>
        </div>
      ))}
    </div>
  );
}