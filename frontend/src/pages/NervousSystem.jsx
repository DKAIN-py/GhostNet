import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { SECTORS, SECTOR_IDS, SECTOR_BY_ID, distanceBetween, nearestSectors } from '../lib/sectors';
import { T } from '../lib/theme';
import CityIncidentDrawer from '../components/dashboard/CityIncidentDrawer';

const W = 1320, H = 860;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;

const NODE_R_ESTIMATE = 9;
const RING_PADDING = 36;
const BASE_RING_RADIUS = 62;
const NODE_ARC_SPACING = 42;
const DISTRICT_GAP = 34;

// Agent ring — was AGENT_ARC_SPACING=34, which put a 12-agent ring at
// ~65px radius (larger than BASE_RING_RADIUS itself), reaching into
// neighboring sectors' space. Shrunk so it stays well within a single
// sector's own territory even at the full 12-agent count.
const AGENT_RING_MIN = 24;
const AGENT_ARC_SPACING = 18;

function severityStyle(status) {
  if (status === 'critical') return T.severity.critical;
  if (status === 'warning') return T.severity.moderate;
  return T.severity.good;
}
function statusColor(status) {
  return severityStyle(status).border;
}
function sectorStatus(health) {
  if (!health) return 'normal';
  if (health.criticalCount > 0) return 'critical';
  if (health.warningCount > 0) return 'warning';
  return 'normal';
}
function agentStatusColor(level) {
  if (level === 'critical') return T.severity.critical.border;
  if (level === 'warning' || level === 'moderate') return T.severity.moderate.border;
  return T.severity.good.border;
}
function labelize(id) { return (id || '').replace(/_/g, ' '); }
function citySeverityKey(severity) {
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'HIGH' || severity === 'ELEVATED') return 'warning';
  return 'normal';
}

function octagonPoints(cx, cy, r) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i - Math.PI / 8;
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

// ── Two-level geographic layout ──────────────────────────────
function computeDistrictLayout() {
  const marginX = 100, marginY = 100;

  const lats = SECTORS.map((s) => s.lat);
  const lngs = SECTORS.map((s) => s.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const lngSpan = maxLng - minLng || 1;
  const latSpan = maxLat - minLat || 1;
  const usableW = W - marginX * 2;
  const usableH = H - marginY * 2;

  const avgLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lngScaleCorrection = Math.cos(avgLatRad);

  const projectedW = lngSpan * lngScaleCorrection;
  const projectedH = latSpan;
  const initialScale = Math.min(usableW / projectedW, usableH / projectedH);

  function project(lat, lng) {
    return {
      x: (lng - minLng) * lngScaleCorrection * initialScale,
      y: (maxLat - lat) * initialScale,
    };
  }

  const rawSector = {};
  SECTORS.forEach((s) => { rawSector[s.sectorId] = project(s.lat, s.lng); });

  const byDistrict = {};
  SECTORS.forEach((s) => { (byDistrict[s.district] ||= []).push(s.sectorId); });
  const districtIds = Object.keys(byDistrict);

  const rawDistrictCenter = {};
  districtIds.forEach((district) => {
    const ids = byDistrict[district];
    rawDistrictCenter[district] = {
      x: ids.reduce((sum, id) => sum + rawSector[id].x, 0) / ids.length,
      y: ids.reduce((sum, id) => sum + rawSector[id].y, 0) / ids.length,
    };
  });

  const ringRadius = {};
  const districtRadius = {};
  districtIds.forEach((district) => {
    const n = byDistrict[district].length;
    const needed = n > 1 ? (NODE_ARC_SPACING * n) / (2 * Math.PI) : 0;
    const ring = Math.max(BASE_RING_RADIUS, needed);
    ringRadius[district] = ring;
    districtRadius[district] = ring + NODE_R_ESTIMATE + RING_PADDING;
  });

  const districtPos = {};
  districtIds.forEach((d) => { districtPos[d] = { ...rawDistrictCenter[d] }; });

  const SPRING = 0.05;
  const ITER = 320;

  for (let iter = 0; iter < ITER; iter++) {
    for (let i = 0; i < districtIds.length; i++) {
      for (let j = i + 1; j < districtIds.length; j++) {
        const a = districtIds[i], b = districtIds[j];
        const minDist = districtRadius[a] + districtRadius[b] + DISTRICT_GAP;
        const dx = districtPos[b].x - districtPos[a].x;
        const dy = districtPos[b].y - districtPos[a].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.001) dist = 0.001;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          districtPos[a].x -= nx * overlap;
          districtPos[a].y -= ny * overlap;
          districtPos[b].x += nx * overlap;
          districtPos[b].y += ny * overlap;
        }
      }
    }
    districtIds.forEach((d) => {
      districtPos[d].x += (rawDistrictCenter[d].x - districtPos[d].x) * SPRING;
      districtPos[d].y += (rawDistrictCenter[d].y - districtPos[d].y) * SPRING;
    });
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  districtIds.forEach((d) => {
    const r = districtRadius[d];
    minX = Math.min(minX, districtPos[d].x - r);
    maxX = Math.max(maxX, districtPos[d].x + r);
    minY = Math.min(minY, districtPos[d].y - r);
    maxY = Math.max(maxY, districtPos[d].y + r);
  });

  const layoutW = (maxX - minX) || 1;
  const layoutH = (maxY - minY) || 1;
  const fitScale = Math.min(usableW / layoutW, usableH / layoutH);

  const offsetX = marginX + (usableW - layoutW * fitScale) / 2 - minX * fitScale;
  const offsetY = marginY + (usableH - layoutH * fitScale) / 2 - minY * fitScale;

  districtIds.forEach((d) => {
    districtPos[d].x = districtPos[d].x * fitScale + offsetX;
    districtPos[d].y = districtPos[d].y * fitScale + offsetY;
    districtRadius[d] = districtRadius[d] * fitScale;
    ringRadius[d] = ringRadius[d] * fitScale;
  });

  const sectorPos = {};

  districtIds.forEach((district) => {
    const ids = byDistrict[district];
    const center = districtPos[district];
    const raw = rawDistrictCenter[district];
    const ring = ringRadius[district];

    if (ids.length === 1) {
      sectorPos[ids[0]] = { x: center.x, y: center.y };
      return;
    }

    const entries = ids.map((id) => {
      const p = rawSector[id];
      const angle = Math.atan2(p.y - raw.y, p.x - raw.x);
      return { id, angle };
    });

    entries.sort((a, b) => a.angle - b.angle);

    const minArcGap = NODE_ARC_SPACING / ring;

    for (let iter = 0; iter < 100; iter++) {
      for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        const next = entries[(i + 1) % entries.length];
        let gap = next.angle - cur.angle;
        if (i === entries.length - 1) gap += Math.PI * 2;
        if (gap < minArcGap) {
          const push = (minArcGap - gap) / 2;
          cur.angle -= push;
          next.angle += push;
        }
      }
    }

    entries.forEach(({ id, angle }) => {
      sectorPos[id] = {
        x: center.x + Math.cos(angle) * ring,
        y: center.y + Math.sin(angle) * ring,
      };
    });
  });

  return { pts: sectorPos, districtCenters: districtPos, districtRadius, byDistrict };
}

function computeAgentRing(count) {
  if (count <= 1) return AGENT_RING_MIN;
  const needed = (AGENT_ARC_SPACING * count) / (2 * Math.PI);
  return Math.max(AGENT_RING_MIN, needed);
}

function getNearest(sectorId, n = 3) {
  return nearestSectors(sectorId, n).map((id) => ({ id, distanceKm: distanceBetween(sectorId, id) }));
}

function clampLabel(x, y, w, h) {
  return {
    x: Math.min(Math.max(x, w / 2 + 6), W - w / 2 - 6),
    y: Math.min(Math.max(y, h + 6), H - 6),
  };
}

function screenToView(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

// ── Sector role — determines which ring/pulse treatment a node gets.
// Health-based severity (statusColor/sectorStatus) still controls the
// octagon's own fill/stroke; this layer is entirely additive on top of
// it, and is what makes "critical" vs "cascade origin" vs "city origin"
// visually distinct instead of collapsing into one red look. ──
function sectorRole(sectorId, cascades, cityAffectedAreas) {
  const cascadeOrigin = (cascades || []).some((c) => c.primarySectorId === sectorId);
  const cascadeSpread = !cascadeOrigin && (cascades || []).some((c) => (c.spatialSpread || []).includes(sectorId));
  const cityOrigin = cityAffectedAreas.some((a) => a.primarySectorId === sectorId);
  const citySecondary = !cityOrigin && cityAffectedAreas.some((a) => (a.secondarySectors || []).includes(sectorId));
  return { cascadeOrigin, cascadeSpread, cityOrigin, citySecondary };
}

export default function NervousSystem() {
  const { sectors, sectorHealth, allSignals, networkStats, cascades, cityIncident, feed } = useGhostnet();
  const navigate = useNavigate();

  const { pts: layout, districtCenters, districtRadius } = useMemo(computeDistrictLayout, []);

  const districtLabels = useMemo(
    () => Object.entries(districtCenters).map(([district, p]) => ({
      district,
      x: p.x,
      y: p.y - (districtRadius[district] || 90) - 16,
    })),
    [districtCenters, districtRadius]
  );

  const cityAffectedAreas = cityIncident?.affectedAreas || [];

  const [hoveredSector, setHoveredSector] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [hoveredAgent, setHoveredAgent] = useState(null);
  const [pings, setPings] = useState([]);
  const [showCityIncidentDrawer, setShowCityIncidentDrawer] = useState(false);
  const prevTopKeyRef = useRef(null);

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(null);
  const pendingPointRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function onWheel(e) {
      e.preventDefault();
      const point = screenToView(svg, e.clientX, e.clientY);
      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setTransform((prev) => {
        const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * zoomFactor));
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          tx: point.x - ratio * (point.x - prev.tx),
          ty: point.y - ratio * (point.y - prev.ty),
        };
      });
    }

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  function handlePointerDown(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const start = screenToView(svg, e.clientX, e.clientY);
    dragRef.current = { startX: start.x, startY: start.y, startTx: transform.tx, startTy: transform.ty };
    setIsDragging(true);
  }
  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    pendingPointRef.current = screenToView(svg, e.clientX, e.clientY);
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!dragRef.current || !pendingPointRef.current) return;
      const cur = pendingPointRef.current;
      const dx = cur.x - dragRef.current.startX;
      const dy = cur.y - dragRef.current.startY;
      setTransform((prev) => ({ ...prev, tx: dragRef.current.startTx + dx, ty: dragRef.current.startTy + dy }));
    });
  }
  function handlePointerUp() {
    dragRef.current = null;
    pendingPointRef.current = null;
    setIsDragging(false);
  }

  function zoomBy(factor) {
    setTransform((prev) => {
      const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      const cx = W / 2, cy = H / 2;
      return {
        scale: nextScale,
        tx: cx - ratio * (cx - prev.tx),
        ty: cy - ratio * (cy - prev.ty),
      };
    });
  }
  function resetView() {
    setTransform({ scale: 1, tx: 0, ty: 0 });
  }

  useEffect(() => {
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
  const focusedDistrict = focusedSectorId ? SECTOR_BY_ID[focusedSectorId]?.district : null;
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
  const selCityArea = cityAffectedAreas.find(
    (a) => a.primarySectorId === selectedSector || (a.secondarySectors || []).includes(selectedSector)
  );

  const totalSectors = SECTOR_IDS.length;
  const sectorsAtRisk = Object.values(sectorHealth).filter((h) => h.criticalCount > 0 || h.warningCount > 0).length;

  const topCritical = useMemo(
    () => allSignals.filter((s) => s.anomalyLevel === 'critical').sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)).slice(0, 8),
    [allSignals]
  );

  const hoverLabel = (() => {
    const id = hoveredSector && !selectedSector ? hoveredSector : null;
    if (!id) return null;
    const pos = layout[id];
    const health = sectorHealth[id];
    const sector = SECTOR_BY_ID[id];
    const status = sectorStatus(health);
    const w = Math.max(120, sector.name.length * 7.2);
    const { x, y } = clampLabel(pos.x, pos.y - 30, w, 36);
    return { id, x, y, w, sector, health, status };
  })();

  return (
    <div className="flex flex-col h-full overflow-y-auto sm:overflow-hidden" style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ══════════════════ HEADER ══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[18px] sm:text-[22px] font-bold tracking-tight" style={{ color: T.text.primary }}>
              NERVOUS SYSTEM
            </span>
            {cityIncident && (
              <button
                onClick={() => setShowCityIncidentDrawer(true)}
                className="text-[9px] tracking-widest uppercase font-bold px-2 py-1"
                style={{
                  color: severityStyle(citySeverityKey(cityIncident.citywideSeverity)).text,
                  background: severityStyle(citySeverityKey(cityIncident.citywideSeverity)).bg,
                  border: 'none',
                  cursor: 'pointer',
                }}
                title="View full city incident"
              >
                CITY: {cityIncident.citywideSeverity}
              </button>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] tracking-wider" style={{ color: T.text.muted }}>
            13 districts · 39 sectors · click a pulsing sector for its cascade path
          </span>
        </div>
        <div className="flex items-center gap-4 sm:gap-7 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          {[
            { label: 'SECTORS AT RISK', value: `${sectorsAtRisk}/${totalSectors}`, alert: sectorsAtRisk > 0 },
            { label: 'CRITICAL AGENTS', value: networkStats.criticalCount, alert: networkStats.criticalCount > 0 },
            { label: 'ACTIVE SIGNALS', value: networkStats.signalCount, alert: false },
            { label: 'ACTIVE CASCADES', value: cascades.length, alert: cascades.length > 0 },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[9px] tracking-[0.2em] uppercase font-bold whitespace-nowrap" style={{ color: T.text.micro }}>{s.label}</span>
              <span className="text-[18px] sm:text-[20px] font-bold leading-none" style={{ color: s.alert ? T.severity.critical.bg : T.text.primary }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════ BODY ════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0">

        {/* ── Graph ───────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-[55vh] sm:min-h-0" style={{ borderRight: `1px solid ${T.border.subtle}`, borderBottom: `1px solid ${T.border.subtle}`, background: T.bg.root }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
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

            <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.scale})`}>

              {/* District octagon containers */}
              {Object.entries(districtCenters).map(([district, center]) => {
                const isActive = focusedDistrict === district;
                const r = districtRadius[district] || 90;
                return (
                  <polygon
                    key={`district-${district}`}
                    points={octagonPoints(center.x, center.y, r)}
                    fill={T.bg.card}
                    fillOpacity={isActive ? 0.6 : 0.32}
                    stroke={isActive ? T.text.muted : T.border.default}
                    strokeWidth={isActive ? 1.8 : 1}
                    style={{ transition: 'fill-opacity 0.2s, stroke 0.2s' }}
                  />
                );
              })}

              {/* District labels */}
              {districtLabels.map((d) => (
                <text
                  key={`${d.district}-halo`}
                  x={d.x} y={d.y}
                  textAnchor="middle"
                  fontSize="12"
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
                  fontSize="12"
                  fontWeight="700"
                  letterSpacing="2.5"
                  fill={T.text.secondary}
                  opacity="0.9"
                  style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                >
                  {d.district}
                </text>
              ))}

              {/* Nearest-neighbor dashed lines — click-driven only */}
              {expandedSectorId && getNearest(expandedSectorId, 3).map(({ id }) => {
                const a = layout[expandedSectorId], b = layout[id];
                if (!a || !b) return null;
                return (
                  <line key={id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={T.text.muted} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity="0.75" />
                );
              })}

              {/* Sector cascade path — only the one the selected sector belongs to */}
              {selCascade && (selCascade.spatialSpread || []).map((targetId, ti) => {
                const a = layout[selCascade.primarySectorId], b = layout[targetId];
                if (!a || !b) return null;
                const d = edgePathD(a, b);
                return (
                  <g key={`sel-cascade-${ti}`}>
                    <path d={d} fill="none" stroke={T.severity.critical.bg} strokeWidth="2.4" opacity="0.8" />
                    <circle r="4" fill={T.severity.critical.bg}>
                      <animateMotion dur="1.6s" repeatCount="indefinite" path={d} />
                    </circle>
                  </g>
                );
              })}

              {/* City incident path — only the one affected area the
                  selected sector belongs to */}
              {selCityArea && (selCityArea.secondarySectors || []).map((targetId, ti) => {
                const a = layout[selCityArea.primarySectorId], b = layout[targetId];
                if (!a || !b) return null;
                const d = edgePathD(a, b, -34);
                return (
                  <path
                    key={`sel-city-${ti}`}
                    d={d} fill="none"
                    stroke={T.accent.indigo}
                    strokeWidth="2"
                    strokeDasharray="6 5"
                    opacity="0.7"
                  />
                );
              })}

              {/* Signal ping flashes */}
              {pings.map((p) => {
                const pos = layout[p.sectorId];
                if (!pos) return null;
                const col = p.critical ? T.severity.critical.bg : T.text.muted;
                return (
                  <circle key={p.id} cx={pos.x} cy={pos.y} r="8" fill="none" stroke={col} strokeWidth="1.5" opacity="0.8">
                    <animate attributeName="r" from="8" to="32" dur="1s" fill="freeze" />
                    <animate attributeName="opacity" from="0.8" to="0" dur="1s" fill="freeze" />
                  </circle>
                );
              })}

              {/* Sector nodes — octagons, with role-based ring overlays.
                  Health severity controls fill/stroke only; role (below)
                  controls the ring treatment, so "critical" and "cascade
                  origin" never look identical. */}
              {SECTOR_IDS.map((sectorId) => {
                const pos = layout[sectorId];
                const sector = SECTOR_BY_ID[sectorId];
                const health = sectorHealth[sectorId];
                const status = sectorStatus(health);
                const role = sectorRole(sectorId, cascades, cityAffectedAreas);
                const color = statusColor(status);
                const isFocused = focusedSectorId === sectorId;
                const isSelected = selectedSector === sectorId;
                const isOrigin = role.cascadeOrigin || role.cityOrigin;
                const r = 6
                  + (status === 'critical' ? 3.5 : status === 'warning' ? 1.5 : 0)
                  + (isFocused ? 2 : 0)
                  + (isOrigin ? 1.5 : 0);

                return (
                  <g key={sectorId}>
                    {/* Cascade role rings — outermost first so origin
                        rings sit visually behind the city ring when both
                        are present */}
                    {role.cascadeSpread && (
                      <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none"
                        stroke={T.severity.critical.bg} strokeWidth="1.4"
                        strokeDasharray="2 4" opacity="0.6" />
                    )}
                    {role.cascadeOrigin && (
                      <circle cx={pos.x} cy={pos.y} r={r + 7} fill="none"
                        stroke={T.severity.critical.bg} strokeWidth="2.6"
                        style={{ animation: 'gn-origin-pulse 1.4s ease-in-out infinite' }} />
                    )}
                    {role.citySecondary && (
                      <circle cx={pos.x} cy={pos.y} r={r + (role.cascadeSpread || role.cascadeOrigin ? 11 : 6)}
                        fill="none" stroke={T.accent.indigo} strokeWidth="1.4"
                        strokeDasharray="2 4" opacity="0.6" />
                    )}
                    {role.cityOrigin && (
                      <circle cx={pos.x} cy={pos.y} r={r + (role.cascadeOrigin ? 12 : 7)}
                        fill="none" stroke={T.accent.indigo} strokeWidth="2.6"
                        style={{ animation: 'gn-origin-pulse 1.4s ease-in-out infinite' }} />
                    )}

                    {(isFocused || isSelected) && (
                      <circle cx={pos.x} cy={pos.y} r={r + 16} fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
                    )}

                    <polygon
                      points={octagonPoints(pos.x, pos.y, r)}
                      fill={status === 'critical' ? T.severity.critical.bg : T.bg.card}
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
                    <circle
                      cx={pos.x} cy={pos.y}
                      r={isOrigin ? Math.max(2.4, r * 0.5) : Math.max(1.4, r * 0.3)}
                      fill={isOrigin ? (role.cascadeOrigin ? T.severity.critical.bg : T.accent.indigo) : color}
                      style={{ pointerEvents: 'none' }}
                    />
                    {sector.isLiveAnchor && (
                      <circle cx={pos.x} cy={pos.y} r={r + 3.5} fill="none" stroke={color} strokeWidth="0.6" strokeDasharray="1.5 2.5" opacity="0.5" style={{ pointerEvents: 'none' }} />
                    )}
                  </g>
                );
              })}

              {/* Agent ring — click-driven only, radius scales with count
                  and now stays well inside the sector's own space */}
              {expandedSectorId && layout[expandedSectorId] && (() => {
                const pos = layout[expandedSectorId];
                const n = focusedAgents.length;
                const ringR = computeAgentRing(n);
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
                          <line x1={pos.x} y1={pos.y} x2={ax} y2={ay} stroke={col} strokeWidth="1.2" opacity="0.6" />
                          <circle
                            cx={ax} cy={ay} r={isSel || isHov ? 5.5 : 4.5}
                            fill={sig.anomalyLevel === 'critical' ? T.severity.critical.bg : T.bg.card}
                            stroke={col} strokeWidth={isSel ? 2 : 1.1}
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
                    {hoveredAgent && focusedAgents.find((a) => a.agentId === hoveredAgent) && (() => {
                      const sig = focusedAgents.find((a) => a.agentId === hoveredAgent);
                      const i = focusedAgents.indexOf(sig);
                      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
                      const ax = pos.x + Math.cos(angle) * ringR;
                      const ay = pos.y + Math.sin(angle) * ringR;
                      const label = labelize(sig.agentId);
                      const w = Math.max(100, label.length * 6.2 + 26);
                      const { x, y } = clampLabel(ax, ay - 18, w, 32);
                      const col = agentStatusColor(sig.anomalyLevel);
                      return (
                        <g style={{ pointerEvents: 'none' }}>
                          <rect x={x - w / 2} y={y - 22} width={w} height={28} rx="3" fill={T.bg.card} stroke={col} strokeWidth="1" />
                          <text x={x} y={y - 9} textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="0.5" fill={T.text.primary} style={{ textTransform: 'uppercase' }}>{label}</text>
                          <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={col}>{sig.healthScore}/100 · {sig.anomalyLevel}</text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })()}

              {/* Hover label */}
              {hoverLabel && (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={hoverLabel.x - hoverLabel.w / 2} y={hoverLabel.y - 28} width={hoverLabel.w} height={36} rx="3"
                    fill={T.bg.card} stroke={statusColor(hoverLabel.status)} strokeWidth="1.2" />
                  <text x={hoverLabel.x} y={hoverLabel.y - 13} textAnchor="middle" fontSize="11" fontWeight="700" fill={T.text.primary}>
                    {hoverLabel.sector.name}
                  </text>
                  <text x={hoverLabel.x} y={hoverLabel.y - 1} textAnchor="middle" fontSize="9" fontWeight="700" fill={statusColor(hoverLabel.status)}>
                    {hoverLabel.health ? `health ${hoverLabel.health.minHealthScore} · ${hoverLabel.status}` : 'nominal'}
                  </text>
                </g>
              )}
            </g>
          </svg>

          {/* Zoom controls */}
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col gap-1" style={{ background: T.bg.card + 'F0', border: `1px solid ${T.border.subtle}` }}>
            <button onClick={() => zoomBy(1.25)} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-bold" style={{ color: T.text.primary, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border.subtle}`, cursor: 'pointer' }}>+</button>
            <button onClick={() => zoomBy(1 / 1.25)} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-bold" style={{ color: T.text.primary, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border.subtle}`, cursor: 'pointer' }}>−</button>
            <button onClick={resetView} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[9px] font-bold" style={{ color: T.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>⟲</button>
          </div>

          {/* Legend — now maps directly to the role system above */}
          <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 flex flex-col gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 max-w-[150px] sm:max-w-none" style={{ background: T.bg.card + 'F0', border: `1px solid ${T.border.subtle}` }}>
            <LegendRow color={T.severity.good.border} label="Normal" />
            <LegendRow color={T.severity.moderate.border} label="Warning" />
            <LegendRow color={T.severity.critical.bg} label="Critical (isolated)" filled />
            <LegendRow color={T.severity.critical.bg} label="Cascade spread" dashed />
            <LegendRow color={T.severity.critical.bg} label="Cascade origin" pulse />
            <LegendRow color={T.accent.indigo} label="City incident secondary" dashed />
            <LegendRow color={T.accent.indigo} label="City incident origin" pulse />
          </div>

          {/* Sector cascade active banner */}
          {cascades.length > 0 && (
            <div className="absolute top-2 sm:top-4 left-1/2 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 flex-wrap justify-center max-w-[92%] text-center" style={{ transform: 'translateX(-50%)', background: T.cascade.bg, border: `1px solid ${T.cascade.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.cascade.text, boxShadow: `0 0 6px ${T.cascade.text}` }} />
              <span className="text-[10px] sm:text-[11px] tracking-[0.2em] font-bold" style={{ color: T.cascade.text }}>
                {cascades.length} CASCADE{cascades.length > 1 ? 'S' : ''} ACTIVE
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold hidden sm:inline" style={{ color: 'rgba(252,237,232,0.65)' }}>
                click a pulsing sector for its path
              </span>
            </div>
          )}

          {/* City incident banner */}
          {cityIncident && (
            <button
              onClick={() => setShowCityIncidentDrawer(true)}
              className="absolute left-1/2 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 flex-wrap justify-center max-w-[92%] text-center"
              style={{
                top: cascades.length > 0 ? 58 : 12,
                transform: 'translateX(-50%)',
                background: T.bg.card,
                border: `1px solid ${T.accent.indigo}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent.indigo }} />
              <span className="text-[10px] sm:text-[11px] tracking-[0.2em] font-bold" style={{ color: T.accent.indigo }}>
                CITY INCIDENT · {cityIncident.citywideSeverity}
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold hidden sm:inline" style={{ color: T.text.muted }}>
                {cityAffectedAreas.length} affected area{cityAffectedAreas.length === 1 ? '' : 's'} · click for details
              </span>
            </button>
          )}
        </div>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        <div className="flex flex-col w-full sm:w-[260px] sm:flex-shrink-0 overflow-y-auto max-h-[45vh] sm:max-h-none" style={{ background: T.bg.card }}>
          {selectedSector ? (
            <>
              <div className="px-4 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="16" height="16" viewBox="0 0 14 14" className="shrink-0">
                    <polygon points={octagonPoints(7, 7, 5.5)} fill="none" stroke={statusColor(sectorStatus(selHealth))} strokeWidth="1.2" />
                  </svg>
                  <span className="text-[15px] font-bold leading-tight truncate" style={{ color: statusColor(sectorStatus(selHealth)) }}>
                    {selSector?.name || selectedSector}
                  </span>
                </div>
                <button onClick={() => { setSelectedSector(null); setSelectedAgentId(null); }} style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
              </div>

              <div className="px-4 pt-2 flex items-center justify-between">
                <span className="text-[9px] tracking-wider font-bold uppercase" style={{ color: T.text.muted }}>{selSector?.district || 'UNKNOWN'}</span>
                <button
                  onClick={() => navigate(`/sectors/${selectedSector}`)}
                  className="text-[9px] tracking-wider font-bold uppercase"
                  style={{ color: T.accent?.teal || T.text.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Full Page →
                </button>
              </div>

              <div className="px-4 py-4 flex flex-col gap-5">
                {selHealth && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.text.micro }}>Sector Health</span>
                      <span className="text-[22px] font-bold leading-none" style={{ color: statusColor(sectorStatus(selHealth)) }}>{selHealth.minHealthScore}</span>
                    </div>
                    <div style={{ height: 5, background: T.bg.surface, borderRadius: 2 }}>
                      <div style={{
                        height: '100%', width: `${selHealth.minHealthScore}%`,
                        background: statusColor(sectorStatus(selHealth)), borderRadius: 2,
                        boxShadow: `0 0 6px ${statusColor(sectorStatus(selHealth))}66`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <span className="text-[10px] font-bold tracking-widest" style={{ color: statusColor(sectorStatus(selHealth)) }}>
                      {sectorStatus(selHealth).toUpperCase()}
                    </span>
                  </div>
                )}

                {selCascade && (
                  <div className="px-3 py-3 flex flex-col gap-1" style={{ background: T.cascade.bg, border: `1px solid ${T.cascade.border}` }}>
                    <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.cascade.text }}>
                      {selCascade.primarySectorId === selectedSector ? 'CASCADE ORIGIN' : 'CASCADE SPREAD'}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: 'rgba(252,237,232,0.9)' }}>{selCascade.predictedEvent}</span>
                    <span className="text-[10px]" style={{ color: 'rgba(252,237,232,0.55)' }}>{selCascade.confidence}% confidence · ~{selCascade.hoursUntil}h</span>
                  </div>
                )}

                {selCityArea && (
                  <button
                    onClick={() => setShowCityIncidentDrawer(true)}
                    className="px-3 py-3 flex flex-col gap-1 text-left"
                    style={{ background: T.bg.surface, border: `1px solid ${T.accent.indigo}`, cursor: 'pointer' }}
                  >
                    <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.accent.indigo }}>
                      {selCityArea.primarySectorId === selectedSector ? 'City Incident Origin' : 'Part of City Incident'}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>
                      {selCityArea.affectedBy?.primaryThreat || 'View details'}
                    </span>
                  </button>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.text.micro }}>Active Agents</span>
                  {selAgents.length === 0 && <span className="text-[10px]" style={{ color: T.text.micro }}>No signals for this sector</span>}
                  {selAgents.map((a) => {
                    const col = agentStatusColor(a.anomalyLevel);
                    const isSel = selectedAgentId === a.agentId;
                    return (
                      <div
                        key={a.agentId}
                        onClick={() => setSelectedAgentId((prev) => prev === a.agentId ? null : a.agentId)}
                        className="flex flex-col gap-1.5 px-2.5 py-2 cursor-pointer"
                        style={{ background: isSel ? T.bg.surface : 'transparent', border: `1px solid ${a.anomalyLevel === 'critical' ? statusColor('critical') + '40' : T.border.subtle}` }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] tracking-wide uppercase font-bold" style={{ color: T.text.secondary }}>{labelize(a.agentId)}</span>
                          <span className="text-[11px] font-bold" style={{ color: col }}>{a.healthScore}</span>
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
                    <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.text.micro }}>Latest Signal</span>
                    <p className="text-[11px] leading-relaxed font-medium" style={{ color: T.text.secondary }}>{selAgent.signal ?? '—'}</p>
                    {selAgent.timestamp && <span className="text-[10px]" style={{ color: T.text.muted }}>{new Date(selAgent.timestamp).toLocaleTimeString()}</span>}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] tracking-wider uppercase font-bold" style={{ color: T.text.micro }}>Nearest Sectors</span>
                  {selNearest.map(({ id, distanceKm }) => (
                    <div key={id} onClick={() => { setSelectedSector(id); setSelectedAgentId(null); }} className="flex items-center justify-between cursor-pointer">
                      <span className="text-[10px] font-bold" style={{ color: T.text.secondary }}>→ {SECTOR_BY_ID[id]?.name || id}</span>
                      <span className="text-[9px]" style={{ color: T.text.micro }}>{distanceKm.toFixed(1)}km</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-6 sm:py-0">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <polygon points={octagonPoints(20, 20, 15)} fill="none" stroke={T.border.subtle} strokeWidth="1" strokeDasharray="3 3" />
                <polygon points={octagonPoints(20, 20, 8)} fill="none" stroke={T.border.subtle} strokeWidth="0.6" />
                <circle cx="20" cy="20" r="2.5" fill={T.border.default} opacity="0.5" />
              </svg>
              <span className="text-[10px] tracking-wider text-center leading-relaxed font-bold" style={{ color: T.text.micro }}>
                click any sector<br />to inspect agents &amp; signals
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════ CRITICAL AGENTS TICKER ═══════════════════════════ */}
      <div className="flex overflow-x-auto flex-shrink-0" style={{ borderTop: `1px solid ${T.border.subtle}`, maxHeight: 112 }}>
        {topCritical.length === 0 && (
          <div className="px-4 py-3"><span className="text-[10px] font-bold" style={{ color: T.text.micro }}>No critical agents right now</span></div>
        )}
        {topCritical.map((sig, i) => (
          <div
            key={`${sig.sectorId}:${sig.agentId}`}
            onClick={() => { setSelectedSector(sig.sectorId); setSelectedAgentId(sig.agentId); }}
            className="px-4 py-3 flex flex-col gap-1 flex-shrink-0 cursor-pointer"
            style={{ width: 200, borderRight: i < topCritical.length - 1 ? `1px solid ${T.cascade.border}` : 'none', background: T.cascade.bg }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.15em] uppercase font-bold" style={{ color: 'rgba(252,237,232,0.55)' }}>{labelize(sig.agentId)}</span>
              <span className="text-[13px] font-bold" style={{ color: T.cascade.text }}>{sig.healthScore}</span>
            </div>
            <span className="text-[10px] font-bold" style={{ color: 'rgba(252,237,232,0.5)' }}>{SECTOR_BY_ID[sig.sectorId]?.name || sig.sectorId}</span>
            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(252,237,232,0.7)' }}>
              {sig.signal?.slice(0, 56)}{sig.signal?.length > 56 ? '…' : ''}
            </p>
          </div>
        ))}
      </div>

      {showCityIncidentDrawer && cityIncident && (
        <CityIncidentDrawer
          incident={cityIncident}
          onClose={() => setShowCityIncidentDrawer(false)}
        />
      )}

      <style>{`
        @keyframes gn-origin-pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1;    }
        }
      `}</style>
    </div>
  );
}

function LegendRow({ color, label, filled, dashed, pulse }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <polygon
          points={octagonPoints(7, 7, 5.5)}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={pulse ? 2 : 1.2}
          strokeDasharray={dashed ? '2 3' : undefined}
          opacity={pulse ? 1 : filled ? 0.9 : 0.85}
        />
      </svg>
      <span className="text-[9px] tracking-wider font-bold" style={{ color: T.text.secondary }}>{label}</span>
    </div>
  );
}