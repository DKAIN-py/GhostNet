import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { SECTORS } from '../lib/sectors';
import { T } from '../lib/theme';
import DistrictSection from '../components/sectors/DistrictSection';
import SeverityLegend from '../components/shared/SeverityLegend';

export default function SectorBrowser() {
  const { sectorHealth } = useGhostnet();
  const [searchParams] = useSearchParams();
  const focusDistrict = searchParams.get('district');
  const [query, setQuery] = useState('');

  const sectorList = useMemo(() => {
    return SECTORS.map((sector) => {
      const health = sectorHealth?.[sector.sectorId];
      const riskScore = health ? Math.max(0, 100 - health.minHealthScore) : 0;
      const nonNominal = health ? health.criticalCount + health.warningCount : 0;
      return { sector, health, riskScore, nonNominal };
    });
  }, [sectorHealth]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sectorList;
    const q = query.toLowerCase();
    return sectorList.filter(({ sector }) => sector.name.toLowerCase().includes(q) || sector.district.toLowerCase().includes(q));
  }, [sectorList, query]);

  const byDistrict = useMemo(() => {
    const map = {};
    filtered.forEach((entry) => {
      const d = entry.sector.district;
      if (!map[d]) map[d] = [];
      map[d].push(entry);
    });
    return Object.entries(map).sort((a, b) => {
      const riskA = Math.max(...a[1].map((s) => s.riskScore));
      const riskB = Math.max(...b[1].map((s) => s.riskScore));
      return riskB - riskA;
    });
  }, [filtered]);

  const sectorsAtRisk = sectorList.filter((s) => s.nonNominal > 0).length;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl tracking-[0.1em] uppercase font-bold" style={{ color: T.text.primary }}>Sectors</h1>
          <p className="text-[11px] tracking-widest mt-1 uppercase" style={{ color: T.text.micro }}>
            {sectorsAtRisk} / {SECTORS.length} sectors at risk
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sector or district…"
          className="text-[11px] px-3 py-2 outline-none w-full sm:w-64"
          style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontFamily: T.font.mono }}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <SeverityLegend />
        <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
          Pill size &amp; weight scale with risk — bigger/bolder = worse
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {byDistrict.map(([district, sectors]) => (
          <DistrictSection
            key={district}
            district={district}
            sectors={sectors}
            defaultOpen={district === focusDistrict || sectors.some((s) => s.nonNominal > 0)}
          />
        ))}
      </div>
    </div>
  );
}