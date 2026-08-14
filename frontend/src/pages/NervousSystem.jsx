import { useEffect, useMemo, useRef, useState } from 'react';
import { useGhostnet } from '../context/GhostnetContext';
import { SECTOR_IDS, SECTOR_BY_ID, distanceBetween, nearestSectors } from '../lib/sectors';
import { T } from '../lib/theme';

// ─────────────────────────────────────────────────────────
// GHOSTNET NERVOUS SYSTEM — SVG rewrite
//
// Why SVG instead of canvas: with 39 real geo-coordinates,
// several sectors sit within a few hundred meters of each
// other (Old Delhi, Central Delhi). Canvas text at that density
// goes blurry and labels stack on top of each other. SVG is
// vector — crisp at any zoom — and lets the browser's own
// animation/hit-testing engine do the heavy lifting instead of
// a hand-rolled requestAnimationFrame loop.
// ─────────────────────────────────────────────────────────

const W = 1320, H = 860;

const STATUS_COLOR = { critical: '#FF4444', warning: '#F0A830', normal: '#8C8575' };

function sectorStatus(health) {
  if (!health) return 'normal';
  if (health.criticalCount > 0) return 'critical';
  if (health.warningCount > 0) return 'warning';
  return 'normal';
}
function agentStatusColor(level) {
  if (level === 'critical') return '#FF4444';
  if (level === 'warning' || level === 'moderate') return '#F0A830';
  return '#8C8575';
}
function labelize(id) { return (id || '').replace(/_/g, ' '); }

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function edgePathD(a, b, curve = 20) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const nx = -dy / len, ny = dx / len;
  const cx = mx + nx * curve, cy = my + ny * curve;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

// ── District-grid layout ─────────────────────────────────────
// Real lat/lng puts several districts (Old Delhi, Central Delhi,
// East Delhi) only 2-3km apart, so any geographic projection —
// even with a declutter pass — keeps fighting itself to avoid
// overlap. Simpler and clearer: give every district its own open
// cell in a grid, roughly compass-ordered so the map still "feels"
// like Delhi, and lay its sectors out evenly spaced inside that
// cell. Guarantees zero overlap, no clamping, nothing fighting
// for space — just open (khula) room for every name.
const DISTRICT_GRID = [
  ['Outer North Delhi', 'North West Delhi', 'Central North Delhi', 'North East Delhi'],
  ['West Delhi',         'North Delhi',      'Old Delhi',           'East Delhi'],
  ['South West Delhi',   'New Delhi',        'Central Delhi',       'South East Delhi'],
  [null,                 'South Delhi',       null,                  null],
];

function computeLayout() {
  const cols = DISTRICT_GRID[0].length;
  const rows = DISTRICT_GRID.length;
  const marginX = 60, marginY = 60;
  const cellW = (W - marginX * 2) / cols;
  const cellH = (H - marginY * 2) / rows;

  const byDistrict = {};
  SECTOR_IDS.forEach((id) => {
    const d = SECTOR_BY_ID[id].district;
    (byDistrict[d] ||= []).push(id);
  });

  const pts = {};
  const districtCenters = {};
  const districtBounds = {};
  const CELL_INSET = 14;

  DISTRICT_GRID.forEach((row, rIdx) => {
    row.forEach((district, cIdx) => {
      if (!district) return;
      const cellX = marginX + cellW * cIdx;
      const cellY = marginY + cellH * rIdx;
      const cx = cellX + cellW / 2;

      districtCenters[district] = { x: cx, y: cellY + 24 };
      districtBounds[district] = {
        x: cellX + CELL_INSET,
        y: cellY + CELL_INSET,
        width: cellW - CELL_INSET * 2,
        height: cellH - CELL_INSET * 2,
      };

      const ids = (byDistrict[district] || []).slice().sort();
      const n = ids.length || 1;
      const rowY = cellY + cellH * 0.62;
      const spread = cellW * 0.6;
      ids.forEach((id, i) => {
        const t = ids.length === 1 ? 0.5 : i / (n - 1);
        pts[id] = { x: cx - spread / 2 + spread * t, y: rowY };
      });
    });
  });

  return { pts, districtCenters, districtBounds };
}

function getNearest(sectorId, n = 3) {
  return nearestSectors(sectorId, n).map((id) => ({ id, distanceKm: distanceBetween(sectorId, id) }));
}

// ── Label placement that stays inside the frame ─────────────
function clampLabel(x, y, w, h) {
  return {
    x: Math.min(Math.max(x, w / 2 + 6), W - w / 2 - 6),
    y: Math.min(Math.max(y, h + 6), H - 6),
  };
}

export default function NervousSystem() {
  const { sectors, sectorHealth, allSignals, networkStats, cascades, feed } = useGhostnet();

  const { pts: layout, districtCenters, districtBounds } = useMemo(computeLayout, []);
  const districtLabels = useMemo(
    () => Object.entries(districtCenters).map(([district, p]) => ({ district, x: p.x, y: p.y })),
    [districtCenters]
  );
  const districtBoxes = useMemo(
    () => Object.entries(districtBounds).map(([district, b]) => ({ district, ...b })),
    [districtBounds]
  );

  const [hoveredSector, setHoveredSector] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [hoveredAgent, setHoveredAgent] = useState(null); // agentId within focused sector
  const [pings, setPings] = useState([]);
  const prevTopKeyRef = useRef(null);

  useEffect(() => {
    // feed is capped at 50 in context (slice(0,50)), so comparing
    // feed.length permanently breaks once the mesh passes 50 signals —
    // comparing the newest item's identity instead keeps this working
    // indefinitely, no matter how long the app has been running.
    const latest = feed[0];
    const latestKey = latest ? `${latest.sectorId}:${latest.agentId}:${latest.timestamp}` : null;

    if (latestKey && latestKey !== prevTopKeyRef.current) {
      if (latest?.sectorId && layout[latest.sectorId]) {
        const id = `${latest.sectorId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setPings((p) => [...p, { id, sectorId: latest.sectorId, critical: latest.anomalyLevel === 'critical' }]);
        setTimeout(() => setPings((p) => p.filter((x) => x.id !== id)), 1000);
      }
    }
    prevTopKeyRef.current = latestKey;
  }, [feed, layout]);

  const focusedSectorId = hoveredSector || selectedSector;
  // Deliberately separate from focusedSectorId: the agent ring and the
  // nearest-neighbor mesh lines are geometry that can physically extend
  // over a neighboring sector's hex. If that geometry appeared on mere
  // hover, hovering sector B while sector A was still "focused" would put
  // A's spokes on top of B (rendered in a later, higher layer), stealing
  // B's click and forcing you to click repeatedly to actually land on it.
  // Keeping expansion tied to an explicit click (selectedSector) means
  // hovering only ever shows a small tooltip anchored on the hovered node
  // itself — nothing that can cover a neighbor.
  const expandedSectorId = selectedSector;
  const focusedAgents = expandedSectorId ? Object.values(sectors[expandedSectorId] || {}).filter(Boolean) : [];

  const selHealth = selectedSector ? sectorHealth[selectedSector] : null;
  const selSector = selectedSector ? SECTOR_BY_ID[selectedSector] : null;
  const selAgents = selectedSector
    ? Object.values(sectors[selectedSector] || {}).filter(Boolean).sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100))
    : [];
  const selAgent = selAgents.find((a) => a.agentId === selectedAgentId) || null;
  const selNearest = selectedSector ? getNearest(selectedSector, 3) : [];
  const selCascade = (cascades || []).find(
    (c) => c.primarySectorId === selectedSector || (c.spatialSpread || []).includes(selectedSector)
  );

  const totalSectors = SECTOR_IDS.length;
  const sectorsAtRisk = Object.values(sectorHealth).filter((h) => h.criticalCount > 0 || h.warningCount > 0).length;

  const topCritical = useMemo(
    () => allSignals.filter((s) => s.anomalyLevel === 'critical').sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)).slice(0, 8),
    [allSignals]
  );

  // ── Hover label (single, no overlap since only 1 renders) ──
  const hoverLabel = (() => {
    const id = hoveredSector && !selectedSector ? hoveredSector : null;
    if (!id) return null;
    const pos = layout[id];
    const health = sectorHealth[id];
    const sector = SECTOR_BY_ID[id];
    const status = sectorStatus(health);
    const w = Math.max(110, sector.name.length * 6.4);
    const { x, y } = clampLabel(pos.x, pos.y - 30, w, 34);
    return { id, x, y, w, sector, health, status };
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ══════════════════ HEADER ══════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-[0.35em] uppercase font-bold" style={{ color: T.text.micro }}>GHOSTNET</span>
            <span style={{ color: T.border.subtle }}>·</span>
            <span className="text-[9px] tracking-[0.35em] uppercase font-bold" style={{ color: T.text.primary }}>NERVOUS SYSTEM</span>
          </div>
          <span className="text-[9px] tracking-wider" style={{ color: T.text.micro }}>
            39-sector topology · signal propagation · cascade detection
          </span>
        </div>
        <div className="flex items-center gap-6">
          {[
            { label: 'SECTORS AT RISK', value: `${sectorsAtRisk}/${totalSectors}`, alert: sectorsAtRisk > 0 },
            { label: 'CRITICAL AGENTS', value: networkStats.criticalCount, alert: networkStats.criticalCount > 0 },
            { label: 'ACTIVE SIGNALS', value: networkStats.signalCount, alert: false },
            { label: 'ACTIVE CASCADES', value: cascades.length, alert: cascades.length > 0 },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-end gap-0.5">
              <span className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>{s.label}</span>
              <span className="text-[14px] font-bold" style={{ color: s.alert ? '#FF4444' : T.text.primary, letterSpacing: '0.05em' }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════ BODY ════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── Graph ───────────────────────────────────────────────────────── */}
        <div className="relative flex-1" style={{ borderRight: `1px solid ${T.border.subtle}`, background: T.bg.root }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <defs>
              <pattern id="gn-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(74,70,61,0.05)" strokeWidth="0.5" />
              </pattern>
              <pattern id="gn-grid-major" width="140" height="140" patternUnits="userSpaceOnUse">
                <path d="M 140 0 L 0 0 0 140" fill="none" stroke="rgba(74,70,61,0.09)" strokeWidth="0.6" />
              </pattern>
              <radialGradient id="gn-vignette" cx="50%" cy="42%" r="75%">
                <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(30,26,20,0.05)" />
              </radialGradient>
            </defs>

            <rect x="0" y="0" width={W} height={H} fill={T.bg.root} />
            <rect x="0" y="0" width={W} height={H} fill="url(#gn-grid)" />
            <rect x="0" y="0" width={W} height={H} fill="url(#gn-grid-major)" />
            <rect x="0" y="0" width={W} height={H} fill="url(#gn-vignette)" />

            {/* District containers — each district's sectors sit inside their
                own rounded room, so the grouping reads instantly instead of
                being implied by whitespace alone. */}
            {districtBoxes.map((b) => {
              const isActiveDistrict = focusedSectorId && SECTOR_BY_ID[focusedSectorId]?.district === b.district;
              return (
                <rect
                  key={b.district}
                  x={b.x} y={b.y} width={b.width} height={b.height}
                  rx="18" ry="18"
                  fill={T.bg.card}
                  fillOpacity={isActiveDistrict ? 0.55 : 0.3}
                  stroke={isActiveDistrict ? T.text.muted : T.border.default}
                  strokeWidth={isActiveDistrict ? 1.6 : 1}
                  style={{ transition: 'fill-opacity 0.2s, stroke 0.2s' }}
                />
              );
            })}

            {/* Ambient district labels — always on, only 13 so no clutter risk.
                Rendered twice: a soft halo pass first so the text stays
                legible sitting on top of grid lines / node glow, then the
                actual dark label on top. */}
            {districtLabels.map((d) => (
              <text
                key={`${d.district}-halo`}
                x={d.x} y={d.y}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                letterSpacing="2.5"
                stroke={T.bg.root}
                strokeWidth="4"
                fill={T.bg.root}
                style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
              >
                {d.district}
              </text>
            ))}
            {districtLabels.map((d) => (
              <text
                key={d.district}
                x={d.x} y={d.y}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                letterSpacing="2.5"
                fill={T.text.secondary}
                opacity="0.85"
                style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
              >
                {d.district}
              </text>
            ))}

            {/* Nearest-neighbor mesh — click-driven only (see expandedSectorId note above) */}
            {expandedSectorId && getNearest(expandedSectorId, 3).map(({ id }) => {
              const a = layout[expandedSectorId], b = layout[id];
              if (!a || !b) return null;
              return (
                <line key={id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={T.text.muted} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity="0.75" />
              );
            })}

            {/* Cascade propagation edges + traveling pulses */}
            {(cascades || []).map((c, ci) =>
              (c.spatialSpread || []).map((targetId, ti) => {
                const a = layout[c.primarySectorId], b = layout[targetId];
                if (!a || !b) return null;
                const pathId = `cascade-${ci}-${ti}`;
                const d = edgePathD(a, b);
                return (
                  <g key={pathId}>
                    <path id={pathId} d={d} fill="none" stroke="#FF4444" strokeWidth="2.4" opacity="0.7" />
                    <circle r="4" fill="#FF4444">
                      <animateMotion dur="1.6s" repeatCount="indefinite" path={d} />
                    </circle>
                  </g>
                );
              })
            )}

            {/* Signal ping flashes */}
            {pings.map((p) => {
              const pos = layout[p.sectorId];
              if (!pos) return null;
              const col = p.critical ? '#FF4444' : '#A39C8D';
              return (
                <circle key={p.id} cx={pos.x} cy={pos.y} r="8" fill="none" stroke={col} strokeWidth="1.5" opacity="0.8">
                  <animate attributeName="r" from="8" to="32" dur="1s" fill="freeze" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="1s" fill="freeze" />
                </circle>
              );
            })}

            {/* Sector nodes */}
            {SECTOR_IDS.map((sectorId) => {
              const pos = layout[sectorId];
              const sector = SECTOR_BY_ID[sectorId];
              const health = sectorHealth[sectorId];
              const status = sectorStatus(health);
              const color = STATUS_COLOR[status];
              const isFocused = focusedSectorId === sectorId;
              const isSelected = selectedSector === sectorId;
              const isCascadeNode = (cascades || []).some(
                (c) => c.primarySectorId === sectorId || (c.spatialSpread || []).includes(sectorId)
              );
              const r = 5 + (status === 'critical' ? 3.5 : status === 'warning' ? 1.5 : 0) + (isFocused ? 2 : 0);

              return (
                <g key={sectorId}>
                  {status === 'critical' && (
                    <circle cx={pos.x} cy={pos.y} r={r * 2.1} fill={color} opacity="0.14">
                      <animate attributeName="opacity" values="0.08;0.20;0.08" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {(isFocused || isSelected) && (
                    <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none" stroke={color} strokeWidth="1.4" opacity="0.6" />
                  )}
                  <polygon
                    points={hexPoints(pos.x, pos.y, r)}
                    fill={status === 'critical' ? '#160808' : T.bg.card}
                    stroke={color}
                    strokeWidth={isSelected ? 2 : 1.3}
                    style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
                    onMouseEnter={() => setHoveredSector(sectorId)}
                    onMouseLeave={() => setHoveredSector(null)}
                    onClick={() => {
                      setSelectedSector((prev) => {
                        const next = prev === sectorId ? null : sectorId;
                        if (next !== prev) setSelectedAgentId(null);
                        return next;
                      });
                    }}
                  />
                  <circle cx={pos.x} cy={pos.y} r={Math.max(1.4, r * 0.32)} fill={color} style={{ pointerEvents: 'none' }} />
                  {sector.isLiveAnchor && (
                    <circle cx={pos.x} cy={pos.y} r={r + 3.5} fill="none" stroke={color} strokeWidth="0.6" strokeDasharray="1.5 2.5" opacity="0.5" style={{ pointerEvents: 'none' }} />
                  )}
                </g>
              );
            })}

            {/* Agent ring — click-driven only, never on hover (see expandedSectorId note above) */}
            {expandedSectorId && layout[expandedSectorId] && (() => {
              const pos = layout[expandedSectorId];
              const n = focusedAgents.length;
              const ringR = 34;
              return (
                <g>
                  {focusedAgents.map((sig, i) => {
                    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
                    const ax = pos.x + Math.cos(angle) * ringR;
                    const ay = pos.y + Math.sin(angle) * ringR;
                    const col = agentStatusColor(sig.anomalyLevel);
                    const isSel = selectedAgentId === sig.agentId;
                    const isHov = hoveredAgent === sig.agentId;
                    return (
                      <g key={sig.agentId}>
                        <line x1={pos.x} y1={pos.y} x2={ax} y2={ay} stroke={col} strokeWidth="1.5" opacity="0.65" />
                        <circle
                          cx={ax} cy={ay} r={isSel || isHov ? 6.5 : 5}
                          fill={sig.anomalyLevel === 'critical' ? '#160808' : T.bg.card}
                          stroke={col} strokeWidth={isSel ? 2 : 1.2}
                          style={{ cursor: 'pointer', transition: 'r 0.12s' }}
                          onMouseEnter={() => setHoveredAgent(sig.agentId)}
                          onMouseLeave={() => setHoveredAgent(null)}
                          onClick={() => {
                            setSelectedSector(expandedSectorId);
                            setSelectedAgentId((prev) => prev === sig.agentId ? null : sig.agentId);
                          }}
                        />
                      </g>
                    );
                  })}
                  {/* single agent tooltip — never more than one on screen */}
                  {hoveredAgent && focusedAgents.find((a) => a.agentId === hoveredAgent) && (() => {
                    const sig = focusedAgents.find((a) => a.agentId === hoveredAgent);
                    const i = focusedAgents.indexOf(sig);
                    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
                    const ax = pos.x + Math.cos(angle) * ringR;
                    const ay = pos.y + Math.sin(angle) * ringR;
                    const label = labelize(sig.agentId);
                    const w = Math.max(90, label.length * 5.6 + 24);
                    const { x, y } = clampLabel(ax, ay - 18, w, 30);
                    const col = agentStatusColor(sig.anomalyLevel);
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={x - w / 2} y={y - 20} width={w} height={26} rx="3" fill={T.bg.card} stroke={col} strokeWidth="1" />
                        <text x={x} y={y - 8} textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="0.5" fill={T.text.primary} style={{ textTransform: 'uppercase' }}>{label}</text>
                        <text x={x} y={y + 2} textAnchor="middle" fontSize="8" fontWeight="700" fill={col}>{sig.healthScore}/100 · {sig.anomalyLevel}</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}

            {/* Hover label — one at a time, background pill, clamped inside frame */}
            {hoverLabel && (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={hoverLabel.x - hoverLabel.w / 2} y={hoverLabel.y - 26} width={hoverLabel.w} height={34} rx="3"
                  fill={T.bg.card} stroke={STATUS_COLOR[hoverLabel.status]} strokeWidth="1.2" />
                <text x={hoverLabel.x} y={hoverLabel.y - 12} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={T.text.primary}>
                  {hoverLabel.sector.name}
                </text>
                <text x={hoverLabel.x} y={hoverLabel.y - 1} textAnchor="middle" fontSize="8" fontWeight="600" fill={STATUS_COLOR[hoverLabel.status]}>
                  {hoverLabel.health ? `health ${hoverLabel.health.minHealthScore} · ${hoverLabel.status}` : 'nominal'}
                </text>
              </g>
            )}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 px-3 py-2.5" style={{ background: T.bg.card + 'F0', border: `1px solid ${T.border.subtle}` }}>
            {[
              { color: STATUS_COLOR.normal, label: 'Normal sector' },
              { color: STATUS_COLOR.warning, label: 'Warning' },
              { color: STATUS_COLOR.critical, label: 'Critical' },
              { color: '#FF4444', label: 'Cascade edge' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <svg width="14" height="12" viewBox="0 0 14 12">
                  <polygon points="7,1 13,4 13,8 7,11 1,8 1,4" fill="none" stroke={l.color} strokeWidth="1.2" />
                </svg>
                <span className="text-[8px] tracking-wider" style={{ color: T.text.micro }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Cascade active banner */}
          {cascades.length > 0 && (
            <div className="absolute top-4 left-1/2 flex items-center gap-3 px-3 py-1.5" style={{ transform: 'translateX(-50%)', background: '#160808', border: '1px solid #FF4444AA' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF4444', boxShadow: '0 0 6px #FF4444' }} />
              <span className="text-[9px] tracking-[0.25em] font-bold" style={{ color: '#FF4444' }}>
                {cascades.length} CASCADE{cascades.length > 1 ? 'S' : ''} ACTIVE
              </span>
              <span className="text-[9px]" style={{ color: 'rgba(255,68,68,0.6)' }}>
                {cascades[0].primarySectorName} · {cascades[0].confidence}% CONF
              </span>
            </div>
          )}
        </div>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0 overflow-y-auto" style={{ width: 240, background: T.bg.card }}>
          {selectedSector ? (
            <>
              <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <div className="flex items-center gap-2">
                  <svg width="12" height="11" viewBox="0 0 12 11">
                    <polygon points="6,0.5 11.5,3.25 11.5,7.75 6,10.5 0.5,7.75 0.5,3.25" fill="none" stroke={STATUS_COLOR[sectorStatus(selHealth)]} strokeWidth="1.2" />
                  </svg>
                  <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: STATUS_COLOR[sectorStatus(selHealth)] }}>
                    {selSector?.name || selectedSector}
                  </span>
                </div>
                <button onClick={() => { setSelectedSector(null); setSelectedAgentId(null); }} style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>
              </div>
              <span className="px-4 pt-2 text-[8px] tracking-wider" style={{ color: T.text.micro }}>{selSector?.district || 'UNKNOWN'}</span>

              <div className="px-4 py-3 flex flex-col gap-4">
                {selHealth && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Sector health</span>
                      <span className="text-[12px] font-bold" style={{ color: STATUS_COLOR[sectorStatus(selHealth)] }}>{selHealth.minHealthScore}</span>
                    </div>
                    <div style={{ height: 4, background: T.bg.surface, borderRadius: 2 }}>
                      <div style={{
                        height: '100%', width: `${selHealth.minHealthScore}%`,
                        background: STATUS_COLOR[sectorStatus(selHealth)], borderRadius: 2,
                        boxShadow: `0 0 6px ${STATUS_COLOR[sectorStatus(selHealth)]}66`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <span className="text-[9px] font-bold tracking-widest" style={{ color: STATUS_COLOR[sectorStatus(selHealth)] }}>
                      {sectorStatus(selHealth).toUpperCase()}
                    </span>
                  </div>
                )}

                {selCascade && (
                  <div className="px-2 py-2 flex flex-col gap-1" style={{ background: '#160808', border: '1px solid #FF444455' }}>
                    <span className="text-[8px] tracking-wider uppercase font-bold" style={{ color: '#FF4444' }}>
                      {selCascade.primarySectorId === selectedSector ? 'CASCADE ORIGIN' : 'CASCADE SPREAD'}
                    </span>
                    <span className="text-[9px]" style={{ color: T.text.secondary }}>{selCascade.predictedEvent}</span>
                    <span className="text-[9px]" style={{ color: T.text.muted }}>{selCascade.confidence}% confidence · ~{selCascade.hoursUntil}h</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Active agents</span>
                  {selAgents.length === 0 && <span className="text-[9px]" style={{ color: T.text.micro }}>No signals for this sector</span>}
                  {selAgents.map((a) => {
                    const col = agentStatusColor(a.anomalyLevel);
                    const isSel = selectedAgentId === a.agentId;
                    return (
                      <div
                        key={a.agentId}
                        onClick={() => setSelectedAgentId((prev) => prev === a.agentId ? null : a.agentId)}
                        className="flex flex-col gap-1 px-2 py-1.5 cursor-pointer"
                        style={{ background: isSel ? T.bg.surface : 'transparent', border: `1px solid ${a.anomalyLevel === 'critical' ? '#FF444440' : T.border.subtle}` }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] tracking-wide uppercase" style={{ color: T.text.secondary }}>{labelize(a.agentId)}</span>
                          <span className="text-[9px] font-bold" style={{ color: col }}>{a.healthScore}</span>
                        </div>
                        <div style={{ height: 3, background: T.bg.surface, borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${a.healthScore}%`, background: col, borderRadius: 2, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selAgent && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Latest signal</span>
                    <p className="text-[9px] leading-relaxed" style={{ color: T.text.secondary }}>{selAgent.signal ?? '—'}</p>
                    {selAgent.timestamp && <span className="text-[9px]" style={{ color: T.text.muted }}>{new Date(selAgent.timestamp).toLocaleTimeString()}</span>}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Nearest sectors</span>
                  {selNearest.map(({ id, distanceKm }) => (
                    <div key={id} onClick={() => { setSelectedSector(id); setSelectedAgentId(null); }} className="flex items-center justify-between cursor-pointer">
                      <span className="text-[8px]" style={{ color: T.text.muted }}>→ {SECTOR_BY_ID[id]?.name || id}</span>
                      <span className="text-[8px]" style={{ color: T.text.micro }}>{distanceKm.toFixed(1)}km</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
              <svg width="36" height="32" viewBox="0 0 36 32">
                <polygon points="18,1.5 34.5,9.75 34.5,22.25 18,30.5 1.5,22.25 1.5,9.75" fill="none" stroke={T.border.subtle} strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="18,8 27,12.5 27,19.5 18,24 9,19.5 9,12.5" fill="none" stroke={T.border.subtle} strokeWidth="0.6" />
                <circle cx="18" cy="16" r="2.5" fill={T.border.default} opacity="0.5" />
              </svg>
              <span className="text-[8px] tracking-wider text-center leading-relaxed" style={{ color: T.text.micro }}>
                click any sector<br />to inspect agents &amp; signals
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════ CRITICAL AGENTS TICKER ═══════════════════════════ */}
      <div className="flex overflow-x-auto flex-shrink-0" style={{ borderTop: `1px solid ${T.border.subtle}`, maxHeight: 108 }}>
        {topCritical.length === 0 && (
          <div className="px-4 py-3"><span className="text-[9px]" style={{ color: T.text.micro }}>No critical agents right now</span></div>
        )}
        {topCritical.map((sig, i) => (
          <div
            key={`${sig.sectorId}:${sig.agentId}`}
            onClick={() => { setSelectedSector(sig.sectorId); setSelectedAgentId(sig.agentId); }}
            className="px-4 py-3 flex flex-col gap-1 flex-shrink-0 cursor-pointer"
            style={{ width: 190, borderRight: i < topCritical.length - 1 ? `1px solid ${T.border.subtle}` : 'none', background: '#110606' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: 'rgba(252,250,245,0.5)' }}>{labelize(sig.agentId)}</span>
              <span className="text-[10px] font-bold" style={{ color: '#FF4444' }}>{sig.healthScore}</span>
            </div>
            <span className="text-[8px]" style={{ color: 'rgba(252,250,245,0.4)' }}>{SECTOR_BY_ID[sig.sectorId]?.name || sig.sectorId}</span>
            <p className="text-[9px] leading-relaxed" style={{ color: 'rgba(252,250,245,0.6)' }}>
              {sig.signal?.slice(0, 60)}{sig.signal?.length > 60 ? '…' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}