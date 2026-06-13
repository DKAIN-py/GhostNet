import { useEffect, useRef, useState, useCallback } from 'react';
import { useGhostnet } from '../context/GhostnetContext';
import { T } from '../lib/theme';

// ─── Canvas ───────────────────────────────────────────────────────────────────
const W = 880, H = 620;

// ─── Node definitions — larger, more dramatic layout ─────────────────────────
const NODES = {
  cascade:  { id: 'cascade',   x: 440, y: 290, r: 58,  label: 'CASCADE',   sub: 'meta-agent',  color: '#FCFAF5', accent: '#FF4444', ring: '#FF4444' },
  air:      { id: 'air',       x: 140, y: 180, r: 42,  label: 'AIR',       sub: 'OpenAQ',      color: '#5B8FE8', accent: '#5B8FE8', ring: '#5B8FE8' },
  transport:{ id: 'transport', x: 740, y: 180, r: 42,  label: 'TRANSPORT', sub: 'TomTom',      color: '#F0A830', accent: '#F0A830', ring: '#F0A830' },
  sentiment:{ id: 'sentiment', x: 440, y: 500, r: 42,  label: 'SENTIMENT', sub: 'Twitter/X',   color: '#C85DC8', accent: '#C85DC8', ring: '#C85DC8' },
  delhi:    { id: 'delhi',     x: 440, y:  70, r: 26,  label: 'DELHI',     sub: 'city node',   color: '#A39C8D', accent: '#A39C8D', ring: '#A39C8D' },
  alert:    { id: 'alert',     x: 440, y: 580, r: 18,  label: 'ALERT',     sub: 'output',      color: '#FF4444', accent: '#FF4444', ring: '#FF4444' },
};

const EDGES = [
  { from: 'air',      to: 'cascade',   id: 'e1', color: '#5B8FE8' },
  { from: 'transport',to: 'cascade',   id: 'e2', color: '#F0A830' },
  { from: 'sentiment',to: 'cascade',   id: 'e3', color: '#C85DC8' },
  { from: 'delhi',    to: 'air',       id: 'e4', color: '#7A7268' },
  { from: 'delhi',    to: 'transport', id: 'e5', color: '#7A7268' },
  { from: 'delhi',    to: 'sentiment', id: 'e6', color: '#7A7268' },
  { from: 'cascade',  to: 'alert',     id: 'e7', color: '#FF4444' },
];

const AGENT_MAP  = { air_quality: 'air', transport: 'transport', sentiment: 'sentiment' };
const AGENT_EDGE = { air: 'e1', transport: 'e2', sentiment: 'e3' };
const DELHI_EDGE = { air: 'e4', transport: 'e5', sentiment: 'e6' };

// ─── Bezier helpers ───────────────────────────────────────────────────────────
function getEdgePath(edge) {
  const A = NODES[edge.from], B = NODES[edge.to];
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  // perpendicular control point — curves outward
  const perp = edge.id === 'e7' ? 0 : 0.22;
  const cx = (A.x + B.x) / 2 - uy * len * perp;
  const cy = (A.y + B.y) / 2 + ux * len * perp;
  return {
    x1: A.x + ux * A.r, y1: A.y + uy * A.r,
    cx, cy,
    x2: B.x - ux * B.r, y2: B.y - uy * B.r,
  };
}

function bezPt(x1, y1, cx, cy, x2, y2, t) {
  const m = 1 - t;
  return { x: m*m*x1 + 2*m*t*cx + t*t*x2, y: m*m*y1 + 2*m*t*cy + t*t*y2 };
}

// ─── Hex path helper ──────────────────────────────────────────────────────────
function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NervousSystem() {
  const { signals, cascade, feed } = useGhostnet();
  const canvasRef    = useRef(null);
  const animRef      = useRef(null);
  const pulses       = useRef([]);
  const prevFeedLen  = useRef(feed.length);
  const [hovered, setHovered]   = useState(null);
  const [selected, setSelected] = useState(null);

  // ── Spawn pulses on new signal ────────────────────────────────────────────
  useEffect(() => {
    if (feed.length > prevFeedLen.current) {
      const latest = feed[0];
      const nid = AGENT_MAP[latest?.agentId];
      if (nid) {
        const col = NODES[nid].color;
        pulses.current.push({ edgeId: AGENT_EDGE[nid], t: 0, color: col, speed: 0.010, size: latest.anomalyLevel === 'critical' ? 7 : 5 });
        pulses.current.push({ edgeId: DELHI_EDGE[nid], t: 0, color: '#8C8575', speed: 0.014, size: 3, rev: true });
      }
    }
    prevFeedLen.current = feed.length;
  }, [feed]);

  // ── Spawn cascade burst ───────────────────────────────────────────────────
  useEffect(() => {
    if (cascade) {
      for (let wave = 0; wave < 5; wave++) {
        setTimeout(() => {
          ['e1','e2','e3'].forEach(eid =>
            pulses.current.push({ edgeId: eid, t: 0, color: '#FF4444', speed: 0.012, size: 6 })
          );
          pulses.current.push({ edgeId: 'e7', t: 0, color: '#FF4444', speed: 0.020, size: 7 });
        }, wave * 250);
      }
    }
  }, [cascade]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function drawHex(x, y, r, fillColor, strokeColor, lineWidth = 1.5, alpha = 1) {
      ctx.globalAlpha = alpha;
      hexPath(ctx, x, y, r);
      ctx.fillStyle = fillColor;
      ctx.fill();
      hexPath(ctx, x, y, r);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function draw(ts) {
      ctx.clearRect(0, 0, W, H);

      // ── BG ──────────────────────────────────────────────────────────────
      ctx.fillStyle = T.bg.root;
      ctx.fillRect(0, 0, W, H);

      // Engineering grid — fine
      ctx.strokeStyle = 'rgba(74,70,61,0.045)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= W; x += 28) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Accent grid — major
      ctx.strokeStyle = 'rgba(74,70,61,0.09)';
      for (let x = 0; x <= W; x += 140) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 140) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Scanline overlay (subtle)
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = 'rgba(74,70,61,0.012)';
        ctx.fillRect(0, y, W, 1);
      }

      const isCas = !!cascade;

      // ── Edges ───────────────────────────────────────────────────────────
      EDGES.forEach(edge => {
        const p = getEdgePath(edge);

        // Wide soft glow behind
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.quadraticCurveTo(p.cx, p.cy, p.x2, p.y2);
        ctx.strokeStyle = edge.color + (isCas && edge.id !== 'e7' ? '30' : '1A');
        ctx.lineWidth = 14;
        ctx.setLineDash([]);
        ctx.stroke();

        // Mid glow
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.quadraticCurveTo(p.cx, p.cy, p.x2, p.y2);
        ctx.strokeStyle = edge.color + (isCas ? '45' : '28');
        ctx.lineWidth = 4;
        ctx.stroke();

        // Core dashed line
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.quadraticCurveTo(p.cx, p.cy, p.x2, p.y2);
        ctx.strokeStyle = edge.color + (isCas ? 'AA' : '55');
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // ── Pulses ───────────────────────────────────────────────────────────
      pulses.current = pulses.current.filter(pu => pu.t <= 1);
      pulses.current.forEach(pulse => {
        const edge = EDGES.find(e => e.id === pulse.edgeId);
        if (!edge) return;
        let { x1, y1, cx, cy, x2, y2 } = getEdgePath(edge);
        if (pulse.rev) { [x1,x2]=[x2,x1]; [y1,y2]=[y2,y1]; }
        const pos  = bezPt(x1,y1,cx,cy,x2,y2, pulse.t);
        const pos0 = bezPt(x1,y1,cx,cy,x2,y2, Math.max(0, pulse.t - 0.13));

        // Outer bloom
        const grd2 = ctx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y, pulse.size * 3.5);
        grd2.addColorStop(0, pulse.color + '55');
        grd2.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size * 3.5, 0, Math.PI*2);
        ctx.fillStyle = grd2;
        ctx.fill();

        // Trail
        const grd = ctx.createLinearGradient(pos0.x,pos0.y,pos.x,pos.y);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(0.6, pulse.color + '55');
        grd.addColorStop(1, pulse.color);
        ctx.beginPath();
        ctx.moveTo(pos0.x, pos0.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = grd;
        ctx.lineWidth = pulse.size * 0.7;
        ctx.stroke();

        // Dot
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size, 0, Math.PI*2);
        ctx.fillStyle = pulse.color;
        ctx.fill();
        // White hot core
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size * 0.38, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();

        pulse.t += pulse.speed;
      });

      // ── Nodes ────────────────────────────────────────────────────────────
      Object.values(NODES).forEach(node => {
        const agKey  = Object.keys(AGENT_MAP).find(k => AGENT_MAP[k] === node.id);
        const sig    = agKey ? signals[agKey] : null;
        const isCrit = sig?.anomalyLevel === 'critical';
        const isMod  = sig?.anomalyLevel === 'moderate';
        const isCasN = node.id === 'cascade';
        const isHov  = hovered === node.id;
        const isSel  = selected === node.id;
        const pulse  = (Math.sin(ts / 800 + node.x * 0.009) + 1) / 2;
        const pulse2 = (Math.sin(ts / 420 + node.y * 0.007) + 1) / 2;

        const critActive = isCrit || (isCasN && isCas);

        // ── Large ambient glow behind node ─────────────────────────────
        if (critActive || isHov || isSel) {
          const glowR = node.r * (critActive ? 2.8 + pulse2 * 0.6 : 2.2);
          const grd = ctx.createRadialGradient(node.x,node.y,node.r * 0.3, node.x,node.y, glowR);
          const glowCol = critActive ? '#FF4444' : node.color;
          grd.addColorStop(0, glowCol + (critActive ? '28' : '18'));
          grd.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowR, 0, Math.PI*2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // ── Outer orbiting hex ring ────────────────────────────────────
        const orbitR = node.r + 14 + pulse * 5;
        hexPath(ctx, node.x, node.y, orbitR);
        ctx.strokeStyle = node.color + (critActive ? '60' : isHov ? '45' : '20');
        ctx.lineWidth = critActive ? 1.5 : 0.8;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Second smaller orbit (only for main agents) ───────────────
        if (node.r >= 40) {
          const orbitR2 = node.r + 22 + pulse2 * 4;
          hexPath(ctx, node.x, node.y, orbitR2);
          ctx.strokeStyle = node.color + (critActive ? '30' : '10');
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // ── Health arc (SVG-style arc outside hex) ─────────────────────
        if (sig) {
          const arcR = node.r + 8;
          const pct  = (100 - sig.healthScore) / 100;
          // Track
          ctx.beginPath();
          ctx.arc(node.x, node.y, arcR, 0, Math.PI*2);
          ctx.strokeStyle = 'rgba(74,70,61,0.10)';
          ctx.lineWidth = 3;
          ctx.stroke();
          // Fill
          ctx.beginPath();
          ctx.arc(node.x, node.y, arcR, -Math.PI/2, -Math.PI/2 + pct * Math.PI * 2);
          const arcCol = isCrit ? '#FF4444' : isMod ? '#F0A830' : node.color;
          ctx.strokeStyle = arcCol;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineCap = 'butt';
        }

        // ── Hex fill + stroke (main body) ─────────────────────────────
        if (critActive) {
          // Dark fill with colored border
          drawHex(node.x, node.y, node.r, '#160808', '#FF4444', 2);
        } else {
          drawHex(node.x, node.y, node.r, T.bg.card, node.color, isSel ? 2 : 1.5);
        }

        // ── Inner hex (decorative) ─────────────────────────────────────
        if (node.r >= 40) {
          hexPath(ctx, node.x, node.y, node.r * 0.6);
          ctx.strokeStyle = node.color + (critActive ? '55' : '22');
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        // ── Pulsing center dot ────────────────────────────────────────
        const dotR = node.r >= 40 ? 4 + pulse * 1.5 : 2.5 + pulse * 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y + (node.sub ? -8 : 0), dotR, 0, Math.PI*2);
        ctx.fillStyle = critActive ? '#FF4444' : node.color;
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y + (node.sub ? -8 : 0), dotR * 0.4, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();

        // ── Label ─────────────────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Agent label
        const labelY = node.sub && node.r >= 40 ? node.y + 4 : node.y;
        ctx.font = `700 ${node.r >= 40 ? 11 : 9}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = critActive ? '#FCFAF5' : T.text.primary;
        ctx.fillText(node.label, node.x, labelY);

        if (node.sub && node.r >= 24) {
          ctx.font = `400 8px 'JetBrains Mono', monospace`;
          ctx.fillStyle = critActive ? 'rgba(252,250,245,0.40)' : T.text.micro;
          ctx.fillText(node.sub, node.x, labelY + 12);
        }

        // ── Health number (top-right of node) ─────────────────────────
        if (sig) {
          const numCol = isCrit ? '#FF4444' : isMod ? '#F0A830' : T.text.muted;
          ctx.font = `700 10px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'left';
          ctx.fillStyle = numCol;
          ctx.fillText(sig.healthScore, node.x + node.r + 5, node.y - node.r + 6);
        }

        // ── Cascade confidence ────────────────────────────────────────
        if (isCasN && isCas) {
          ctx.font = `700 12px 'JetBrains Mono', monospace`;
          ctx.fillStyle = '#FF4444';
          ctx.textAlign = 'center';
          ctx.fillText(`${cascade.confidence}%`, node.x, node.y + node.r + 18);
          ctx.font = `400 8px 'JetBrains Mono', monospace`;
          ctx.fillStyle = T.text.micro;
          ctx.fillText('CONF', node.x, node.y + node.r + 29);
        }
      });

      // ── Selected node highlight ring ──────────────────────────────────────
      if (selected) {
        const n = NODES[selected];
        const sel2 = (Math.sin(ts / 350) + 1) / 2;
        hexPath(ctx, n.x, n.y, n.r + 18 + sel2 * 5);
        ctx.strokeStyle = n.color + 'AA';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [signals, cascade, hovered, selected]);

  // ── Hit detection ─────────────────────────────────────────────────────────
  const getHit = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);
    return Object.values(NODES).find(n => Math.hypot(mx - n.x, my - n.y) < n.r + 14) ?? null;
  }, []);

  const handleMove  = useCallback(e => setHovered(getHit(e)?.id ?? null), [getHit]);
  const handleClick = useCallback(e => {
    const hit = getHit(e);
    setSelected(prev => prev === hit?.id ? null : hit?.id ?? null);
  }, [getHit]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const agentSigs = Object.values(signals).filter(Boolean);
  const critCount = agentSigs.filter(s => s.anomalyLevel === 'critical').length;
  const avgHealth = agentSigs.length
    ? Math.round(agentSigs.reduce((a, s) => a + s.healthScore, 0) / agentSigs.length)
    : 100;

  const selNode  = selected ? NODES[selected] : null;
  const selAgKey = selected ? Object.keys(AGENT_MAP).find(k => AGENT_MAP[k] === selected) : null;
  const selSig   = selAgKey ? signals[selAgKey] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ══════════════════ HEADER ══════════════════════════════════════════ */}
      <div
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-[0.35em] uppercase font-bold" style={{ color: T.text.micro }}>GHOSTNET</span>
            <span style={{ color: T.border.subtle }}>·</span>
            <span className="text-[9px] tracking-[0.35em] uppercase font-bold" style={{ color: T.text.primary }}>NERVOUS SYSTEM</span>
          </div>
          <span className="text-[9px] tracking-wider" style={{ color: T.text.micro }}>
            live agent topology · signal propagation · cascade detection
          </span>
        </div>

        <div className="flex items-center gap-6">
          {[
            { label: 'CRITICAL',   value: `${critCount}/3`,            alert: critCount > 0  },
            { label: 'AVG HEALTH', value: avgHealth,                    alert: avgHealth < 50 },
            { label: 'SIGNALS',    value: feed.length,                  alert: false          },
            { label: 'CASCADE',    value: cascade ? 'ACTIVE' : 'NONE', alert: !!cascade       },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-end gap-0.5">
              <span className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>{s.label}</span>
              <span className="text-[14px] font-bold" style={{ color: s.alert ? '#FF4444' : T.text.primary, letterSpacing: '0.05em' }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════ BODY ════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── Canvas ──────────────────────────────────────────────────────── */}
        <div className="relative flex-1" style={{ borderRight: `1px solid ${T.border.subtle}` }}>
          <canvas
            ref={canvasRef}
            width={W} height={H}
            style={{ width: '100%', height: '100%', display: 'block', cursor: hovered ? 'pointer' : 'default' }}
            onMouseMove={handleMove}
            onMouseLeave={() => setHovered(null)}
            onClick={handleClick}
          />

          {/* Legend */}
          <div
            className="absolute bottom-4 left-4 flex flex-col gap-2 px-3 py-2.5"
            style={{ background: T.bg.card + 'F0', border: `1px solid ${T.border.subtle}` }}
          >
            {[
              { color: '#5B8FE8', label: 'Air quality'  },
              { color: '#F0A830', label: 'Transport'     },
              { color: '#C85DC8', label: 'Sentiment'     },
              { color: '#FF4444', label: 'Alert/cascade' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <svg width="14" height="12" viewBox="0 0 14 12">
                  <polygon points="7,1 13,4 13,8 7,11 1,8 1,4" fill="none" stroke={l.color} strokeWidth="1.2"/>
                </svg>
                <span className="text-[8px] tracking-wider" style={{ color: T.text.micro }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Hover tooltip — only when nothing selected */}
          {hovered && !selected && (() => {
            const n   = NODES[hovered];
            const ak  = Object.keys(AGENT_MAP).find(k => AGENT_MAP[k] === hovered);
            const sig = ak ? signals[ak] : null;
            return (
              <div
                className="absolute top-4 right-4 px-3 py-2.5 flex flex-col gap-1.5"
                style={{ border: `1px solid ${n.color}55`, background: T.bg.card, minWidth: 176 }}
              >
                <div className="flex items-center gap-2">
                  <div style={{ width: 7, height: 7, background: n.color, clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' }} />
                  <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: n.color }}>{n.label}</span>
                </div>
                <span className="text-[8px]" style={{ color: T.text.micro }}>{n.sub}</span>
                {sig && (
                  <>
                    <div style={{ height: 1, background: T.border.subtle, margin: '2px 0' }} />
                    <span className="text-[9px]" style={{ color: T.text.secondary }}>
                      health: <span style={{ color: sig.anomalyLevel === 'critical' ? '#FF4444' : T.text.primary }}>{sig.healthScore}/100</span>
                    </span>
                    <span className="text-[9px]" style={{ color: T.text.secondary }}>
                      status: <span style={{ color: sig.anomalyLevel === 'critical' ? '#FF4444' : sig.anomalyLevel === 'moderate' ? '#F0A830' : n.color }}>{sig.anomalyLevel}</span>
                    </span>
                    <span className="text-[9px] leading-relaxed" style={{ color: T.text.micro }}>
                      {sig.signal?.slice(0, 70)}{sig.signal?.length > 70 ? '…' : ''}
                    </span>
                  </>
                )}
                {hovered === 'cascade' && cascade && (
                  <>
                    <div style={{ height: 1, background: T.border.subtle, margin: '2px 0' }} />
                    <span className="text-[9px] font-bold" style={{ color: '#FF4444' }}>{cascade.confidence}% confidence</span>
                    <span className="text-[9px]" style={{ color: T.text.secondary }}>{cascade.predictedEvent}</span>
                  </>
                )}
                <span className="text-[8px] mt-1" style={{ color: T.text.micro }}>click to pin ↗</span>
              </div>
            );
          })()}

          {/* Cascade active banner */}
          {cascade && (
            <div
              className="absolute top-4 left-1/2 flex items-center gap-2 px-3 py-1.5"
              style={{
                transform: 'translateX(-50%)',
                background: '#160808',
                border: '1px solid #FF4444AA',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF4444', boxShadow: '0 0 6px #FF4444' }} />
              <span className="text-[9px] tracking-[0.25em] font-bold" style={{ color: '#FF4444' }}>CASCADE ACTIVE</span>
              <span className="text-[9px]" style={{ color: 'rgba(255,68,68,0.6)' }}>{cascade.confidence}% CONF</span>
            </div>
          )}
        </div>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0" style={{ width: 210, background: T.bg.card }}>
          {selNode ? (
            <>
              {/* Node header */}
              <div
                className="px-4 py-3 flex items-center justify-between flex-shrink-0"
                style={{ borderBottom: `1px solid ${T.border.subtle}` }}
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="11" viewBox="0 0 12 11">
                    <polygon points="6,0.5 11.5,3.25 11.5,7.75 6,10.5 0.5,7.75 0.5,3.25"
                      fill="none" stroke={selNode.color} strokeWidth="1.2"/>
                  </svg>
                  <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: selNode.color }}>
                    {selNode.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}
                >✕</button>
              </div>
              <span className="px-4 pt-2 text-[8px] tracking-wider" style={{ color: T.text.micro }}>{selNode.sub}</span>

              {/* Signal data */}
              {selSig ? (
                <div className="px-4 py-3 flex flex-col gap-4 overflow-y-auto">

                  {/* Health gauge */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Health</span>
                      <span className="text-[12px] font-bold" style={{
                        color: selSig.anomalyLevel === 'critical' ? '#FF4444'
                          : selSig.anomalyLevel === 'moderate' ? '#F0A830'
                          : '#5BC87B'
                      }}>{selSig.healthScore}</span>
                    </div>
                    {/* Bar */}
                    <div style={{ height: 4, background: T.bg.surface, borderRadius: 2 }}>
                      <div style={{
                        height: '100%',
                        width: `${selSig.healthScore}%`,
                        background: selSig.anomalyLevel === 'critical' ? '#FF4444' : selSig.anomalyLevel === 'moderate' ? '#F0A830' : selNode.color,
                        borderRadius: 2,
                        boxShadow: `0 0 6px ${selSig.anomalyLevel === 'critical' ? '#FF444488' : selNode.color + '66'}`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Status</span>
                    <div
                      className="px-2 py-1 inline-block"
                      style={{
                        background: selSig.anomalyLevel === 'critical' ? '#1A0606' : T.bg.surface,
                        border: `1px solid ${selSig.anomalyLevel === 'critical' ? '#FF444455' : selSig.anomalyLevel === 'moderate' ? '#F0A83055' : T.border.subtle}`,
                      }}
                    >
                      <span className="text-[9px] font-bold tracking-widest" style={{
                        color: selSig.anomalyLevel === 'critical' ? '#FF4444'
                          : selSig.anomalyLevel === 'moderate' ? '#F0A830'
                          : T.text.muted
                      }}>
                        {selSig.anomalyLevel?.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Signal text */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Latest signal</span>
                    <p className="text-[9px] leading-relaxed" style={{ color: T.text.secondary }}>{selSig.signal ?? '—'}</p>
                  </div>

                  {/* Timestamp */}
                  {selSig.timestamp && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Timestamp</span>
                      <span className="text-[9px]" style={{ color: T.text.muted }}>{new Date(selSig.timestamp).toLocaleTimeString()}</span>
                    </div>
                  )}

                  {/* Edges */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[8px] tracking-wider uppercase" style={{ color: T.text.micro }}>Connections</span>
                    {EDGES.filter(e => e.from === selected || e.to === selected).map(e => (
                      <div key={e.id} className="flex items-center gap-2">
                        <div style={{ width: 5, height: 5, background: e.color, borderRadius: '50%', flexShrink: 0 }} />
                        <span className="text-[8px]" style={{ color: T.text.muted }}>
                          {NODES[e.from].label} → {NODES[e.to].label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selected === 'cascade' && cascade ? (
                <div className="px-4 py-3 flex flex-col gap-4">
                  <div>
                    <span className="text-[8px] tracking-wider uppercase block mb-1" style={{ color: T.text.micro }}>Confidence</span>
                    <span className="text-[28px] font-bold" style={{ color: '#FF4444' }}>{cascade.confidence}%</span>
                  </div>
                  <div>
                    <span className="text-[8px] tracking-wider uppercase block mb-1" style={{ color: T.text.micro }}>Predicted event</span>
                    <p className="text-[9px] leading-relaxed" style={{ color: T.text.secondary }}>{cascade.predictedEvent}</p>
                  </div>
                  {cascade.hoursUntil && (
                    <div>
                      <span className="text-[8px] tracking-wider uppercase block mb-1" style={{ color: T.text.micro }}>Hours until</span>
                      <span className="text-[16px] font-bold" style={{ color: T.text.primary }}>{cascade.hoursUntil}h</span>
                    </div>
                  )}
                  {cascade.recommendation && (
                    <div>
                      <span className="text-[8px] tracking-wider uppercase block mb-1" style={{ color: T.text.micro }}>Recommendation</span>
                      <p className="text-[9px] leading-relaxed" style={{ color: T.text.secondary }}>{cascade.recommendation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3">
                  <span className="text-[9px]" style={{ color: T.text.micro }}>No live data for this node</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
              <svg width="36" height="32" viewBox="0 0 36 32">
                <polygon points="18,1.5 34.5,9.75 34.5,22.25 18,30.5 1.5,22.25 1.5,9.75"
                  fill="none" stroke={T.border.subtle} strokeWidth="1" strokeDasharray="3 3"/>
                <polygon points="18,8 27,12.5 27,19.5 18,24 9,19.5 9,12.5"
                  fill="none" stroke={T.border.subtle} strokeWidth="0.6"/>
                <circle cx="18" cy="16" r="2.5" fill={T.border.default} opacity="0.5"/>
              </svg>
              <span className="text-[8px] tracking-wider text-center leading-relaxed" style={{ color: T.text.micro }}>
                click any node<br/>to inspect signal
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════ AGENT ROW ════════════════════════════════════════ */}
      <div className="grid grid-cols-3 flex-shrink-0" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
        {['air_quality', 'transport', 'sentiment'].map((agId, i) => {
          const sig    = signals[agId];
          const nid    = AGENT_MAP[agId];
          const node   = NODES[nid];
          const isCrit = sig?.anomalyLevel === 'critical';
          const isMod  = sig?.anomalyLevel === 'moderate';
          const isSel  = selected === nid;
          return (
            <div
              key={agId}
              className="px-4 py-3 flex flex-col gap-1.5"
              style={{
                borderRight: i < 2 ? `1px solid ${T.border.subtle}` : 'none',
                background: isCrit ? '#110606' : isSel ? T.bg.surface : T.bg.card,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onClick={() => setSelected(prev => prev === nid ? null : nid)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="9" height="8" viewBox="0 0 9 8">
                    <polygon points="4.5,0.5 8.5,2.5 8.5,5.5 4.5,7.5 0.5,5.5 0.5,2.5"
                      fill="none" stroke={node.color} strokeWidth="1"/>
                  </svg>
                  <span className="text-[8px] tracking-[0.2em] uppercase font-bold"
                    style={{ color: isCrit ? 'rgba(252,250,245,0.35)' : T.text.micro }}>
                    {agId.replace('_', ' ')}
                  </span>
                </div>
                {sig && (
                  <span className="text-[10px] font-bold" style={{ color: isCrit ? '#FF4444' : isMod ? '#F0A830' : node.color }}>
                    {sig.healthScore}
                  </span>
                )}
              </div>

              <p className="text-[9px] leading-relaxed" style={{ color: isCrit ? 'rgba(252,250,245,0.6)' : T.text.secondary }}>
                {sig?.signal ?? '—'}
              </p>

              {/* Health bar */}
              <div style={{ height: 2, background: T.bg.surface, marginTop: 2 }}>
                {sig && (
                  <div style={{
                    height: '100%',
                    width: `${sig.healthScore}%`,
                    background: isCrit ? '#FF4444' : isMod ? '#F0A830' : node.color,
                    boxShadow: isCrit ? '0 0 4px #FF4444' : undefined,
                    transition: 'width 0.6s ease',
                  }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}