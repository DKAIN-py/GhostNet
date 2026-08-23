import { useState } from 'react';
import { T } from '../../lib/theme';
import SectorPill from './SectorPill';

export default function DistrictSection({ district, sectors, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const avgRisk = Math.round(sectors.reduce((sum, s) => sum + s.riskScore, 0) / sectors.length);
  const atRisk = sectors.filter((s) => s.nonNominal > 0).length;

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: T.text.micro }}>{open ? '▾' : '▸'}</span>
          <span className="text-[12px] tracking-wide uppercase font-bold" style={{ color: T.text.primary }}>{district}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: T.text.micro }}>{atRisk}/{sectors.length} flagged</span>
          <span className="text-[13px] font-bold" style={{ color: avgRisk >= 40 ? T.severity.critical.bg : T.text.primary }}>{avgRisk}</span>
        </div>
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {sectors.map(({ sector, health, riskScore }) => (
            <SectorPill key={sector.sectorId} sector={sector} health={health} riskScore={riskScore} />
          ))}
        </div>
      )}
    </div>
  );
}