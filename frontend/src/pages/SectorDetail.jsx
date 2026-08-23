import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { useSparklineData } from '../hooks/useSparklineData';
import { SECTOR_BY_ID, SECTOR_IDS, distanceBetween } from '../lib/sectors';
import { ALL_AGENT_IDS, AGENT_META } from '../lib/schema';
import { T } from '../lib/theme';
import AgentCard from '../components/dashboard/AgentCard';
import SignalFeed from '../components/dashboard/SignalFeed';
import SeverityLegend from '../components/shared/SeverityLegend';

export default function SectorDetail() {
  const { sectorId } = useParams();
  const navigate = useNavigate();

  const {
    sectors,
    sectorHealth,
    cascades,
    connected,
  } = useGhostnet();

  const sparklines = useSparklineData();

  const sector = SECTOR_BY_ID[sectorId];
  const agents = sectors?.[sectorId] || {};
  const health = sectorHealth?.[sectorId];



  const riskScore = health
    ? Math.max(0, 100 - health.minHealthScore)
    : 0;

  const roleCascade = useMemo(
    () =>
      (cascades || []).find(
        (c) =>
          c.primarySectorId === sectorId ||
          c.spatialSpread?.includes(sectorId)
      ),
    [cascades, sectorId]
  );

  const isOrigin =
    roleCascade?.primarySectorId === sectorId;

  const nearest = useMemo(() => {
    return SECTOR_IDS
      .filter((id) => id !== sectorId)
      .map((id) => ({
        id,
        distanceKm: distanceBetween(sectorId, id),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);
  }, [sectorId]);

  if (!sector) {
    return (
      <div
        className="p-5"
        style={{
          fontFamily: T.font.mono,
          color: T.text.primary,
        }}
      >
        Unknown sector.{' '}
        <button
          onClick={() => navigate('/sectors')}
          style={{
            textDecoration: 'underline',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.text.primary,
            fontFamily: T.font.mono,
          }}
        >
          Back to Sectors
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto"
      style={{
        fontFamily: T.font.mono,
        background: T.bg.root,
      }}
    >
      {/* ============================================================
          HEADER
      ============================================================ */}

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate('/sectors')}
            className="text-[10px] tracking-widest uppercase mb-2"
            style={{
              color: T.text.micro,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: T.font.mono,
            }}
          >
            ← Back to Sectors
          </button>

          <h1
            className="text-xl sm:text-2xl tracking-[0.08em] uppercase font-bold"
            style={{ color: T.text.primary }}
          >
            {sector.name}
          </h1>

          <p
            className="text-[11px] tracking-widest mt-1 uppercase"
            style={{ color: T.text.micro }}
          >
            {sector.district} · {sectorId}
          </p>
        </div>

        <button
          onClick={() =>
            navigate('/citymap', {
              state: { focusSectorId: sectorId },
            })
          }
          className="text-[10px] tracking-widest uppercase px-3.5 py-2 font-bold transition-all"
          style={{
            border: `1px solid ${T.border.default}`,
            color: T.text.secondary,
            background: T.bg.surface,
            fontFamily: T.font.mono,
            cursor: 'pointer',
          }}
        >
          ⬢ VIEW ON MAP
        </button>
      </div>

      {/* ============================================================
          CASCADE BANNER
      ============================================================ */}

      {roleCascade && (
        <div
          className="px-4 py-3 text-[12px] tracking-wide uppercase font-bold"
          style={{
            background: T.cascade.bg,
            color: T.cascade.text,
            border: `1px solid ${T.cascade.border}`,
          }}
        >
          ⚠ {isOrigin ? 'CASCADE ORIGIN' : 'CASCADE SPREAD'} —{' '}
          {roleCascade.predictedEvent}
        </div>
      )}

      {/* ============================================================
          SECTOR INTELLIGENCE
          
          LEFT  = summary
          RIGHT = 12-agent radar
      ============================================================ */}

      <div
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-px"
        style={{
          background: T.border.subtle,
          border: `1px solid ${T.border.default}`,
        }}
      >
        {/* ----------------------------------------------------------
            LEFT: SECTOR SUMMARY
        ---------------------------------------------------------- */}

        <div
          className="flex flex-col"
          style={{
            background: T.bg.card,
            minHeight: 320,
          }}
        >
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{
              borderBottom: `1px solid ${T.border.subtle}`,
            }}
          >
            <div>
              <span
                className="text-[10px] tracking-[0.2em] uppercase font-bold"
                style={{ color: T.text.micro }}
              >
                SECTOR INTELLIGENCE
              </span>

              <h2
                className="text-lg sm:text-xl font-bold mt-1"
                style={{ color: T.text.primary }}
              >
                {sector.name}
              </h2>
            </div>

            <span
              className="text-[9px] tracking-widest uppercase"
              style={{ color: T.text.micro }}
            >
              {sectorId}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 flex-1">
            <VitalBlock
              label="RISK SCORE"
              value={riskScore}
              alert={riskScore >= 60}
            />

            <VitalBlock
              label="AGENTS FLAGGED"
              value={`${(health?.criticalCount ?? 0) + (health?.warningCount ?? 0)}/12`}
              alert={(health?.criticalCount ?? 0) > 0}
            />

            <VitalBlock
              label="CRITICAL"
              value={health?.criticalCount ?? 0}
              alert={(health?.criticalCount ?? 0) > 0}
            />
          </div>

          {/* Domain matrix — gives the intelligence panel a visual readout
              without duplicating the radar or inventing new backend data. */}
          <div
            className="px-5 py-4 flex flex-col gap-3"
            style={{
              borderTop: `1px solid ${T.border.subtle}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="text-[9px] tracking-[0.2em] uppercase font-bold"
                  style={{ color: T.text.micro }}
                >
                  DOMAIN MATRIX
                </span>
                <span
                  className="text-[8px] ml-3 tracking-wider"
                  style={{ color: T.text.micro }}
                >
                  LIVE HEALTH DISTRIBUTION
                </span>
              </div>

              <span
                className="text-[8px] tracking-widest uppercase"
                style={{ color: T.text.micro }}
              >
                {Object.keys(agents).length}/{ALL_AGENT_IDS.length} ONLINE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
              {ALL_AGENT_IDS.map((agentId) => {
                const signal = agents[agentId];
                const score = signal?.healthScore;
                const severity = signal?.anomalyLevel?.toLowerCase();
                const isCritical = severity === 'critical' || (typeof score === 'number' && score < 35);
                const isWarning = severity === 'warning' || severity === 'moderate' || (typeof score === 'number' && score >= 35 && score < 60);
                const accent = isCritical
                  ? T.severity.critical.bg
                  : isWarning
                    ? T.severity.moderate.text
                    : T.severity.good.border;
                const label = AGENT_META[agentId]?.label || agentId;

                return (
                  <div
                    key={agentId}
                    className="relative px-2.5 py-2"
                    title={signal ? `${label} · ${score}/100` : `${label} · awaiting signal`}
                    style={{
                      background: T.bg.surface,
                      border: `1px solid ${T.border.subtle}`,
                      minWidth: 0,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[7px] tracking-wide uppercase truncate"
                        style={{ color: T.text.secondary }}
                      >
                        {label}
                      </span>
                      <span
                        className="text-[9px] font-bold flex-shrink-0"
                        style={{ color: signal ? accent : T.text.micro }}
                      >
                        {typeof score === 'number' ? score : '—'}
                      </span>
                    </div>

                    <div
                      className="mt-1.5"
                      style={{
                        height: 2,
                        background: T.bg.card,
                      }}
                    >
                      {typeof score === 'number' && (
                        <div
                          style={{
                            width: `${Math.max(0, Math.min(100, score))}%`,
                            height: '100%',
                            background: accent,
                            transition: 'width 0.5s ease',
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sector status strip */}
          <div
            className="px-5 py-4 flex items-center justify-between gap-4"
            style={{
              borderTop: `1px solid ${T.border.subtle}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background:
                    (health?.criticalCount ?? 0) > 0
                      ? T.severity.critical.bg
                      : T.severity.good.border,
                  boxShadow:
                    (health?.criticalCount ?? 0) > 0
                      ? `0 0 8px ${T.severity.critical.bg}`
                      : 'none',
                }}
              />

              <span
                className="text-[9px] tracking-[0.18em] uppercase font-bold"
                style={{
                  color:
                    (health?.criticalCount ?? 0) > 0
                      ? T.severity.critical.bg
                      : T.text.secondary,
                }}
              >
                {(health?.criticalCount ?? 0) > 0
                  ? 'ATTENTION REQUIRED'
                  : 'SECTOR STABLE'}
              </span>
            </div>

            <span
              className="text-[9px] tracking-wider"
              style={{ color: T.text.micro }}
            >
              {Object.keys(agents).length}/{ALL_AGENT_IDS.length} agents reporting
            </span>
          </div>
        </div>

        {/* ----------------------------------------------------------
            RIGHT: 12 AGENT RADAR
        ---------------------------------------------------------- */}

        <AgentRadarChart
          agents={agents}
          agentIds={ALL_AGENT_IDS}
        />
      </div>

      {/* ============================================================
          AGENT SIGNALS
      ============================================================ */}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span
            className="text-[11px] tracking-[0.2em] uppercase font-bold"
            style={{ color: T.text.primary }}
          >
            AGENT SIGNALS
          </span>

          <SeverityLegend />
        </div>

        <p
          className="text-[10px] tracking-wide"
          style={{ color: T.text.micro }}
        >
          Card fill = severity (dark red border = critical, amber tint =
          warning, plain = nominal). "TRIGGERED" means this reading is part
          of the active cascade calculation, not just individually severe.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_AGENT_IDS.map((agentId) =>
            agents[agentId] ? (
              <AgentCard
                key={agentId}
                signal={agents[agentId]}
                sparkline={
                  sparklines[`${sectorId}:${agentId}`]
                }
              />
            ) : (
              <div
                key={agentId}
                className="flex items-center justify-center p-4 text-[10px] tracking-widest uppercase"
                style={{
                  border: `1px dashed ${T.border.subtle}`,
                  color: T.text.micro,
                  minHeight: 120,
                }}
              >
                {AGENT_META[agentId]?.label || agentId} · awaiting signal
              </div>
            )
          )}
        </div>
      </div>

      {/* ============================================================
          SIGNAL FEED
      ============================================================ */}

      <div
        style={{
          border: `1px solid ${T.border.default}`,
        }}
      >
        <SignalFeed
          sectorId={sectorId}
          limit={20}
          title="RECENT ACTIVITY — THIS SECTOR"
        />
      </div>

      {/* ============================================================
          NEAREST SECTORS
      ============================================================ */}

      <div className="flex flex-col gap-2">
        <span
          className="text-[10px] tracking-widest uppercase font-bold"
          style={{ color: T.text.micro }}
        >
          NEAREST SECTORS
        </span>

        <div className="flex flex-wrap gap-2">
          {nearest.map(({ id }) => (
            <button
              key={id}
              onClick={() => navigate(`/sectors/${id}`)}
              className="text-[11px] tracking-wide px-3 py-1.5 transition-all"
              style={{
                border: `1px solid ${T.border.default}`,
                color: T.text.secondary,
                background: T.bg.card,
                fontFamily: T.font.mono,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = T.bg.hover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = T.bg.card)
              }
            >
              {SECTOR_BY_ID[id]?.name || id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ========================================================================
   12-AGENT RADAR / SPIDER CHART

   Uses the SAME data already used by AgentCard:
   agents[agentId].healthScore

   No external chart library.
   No new schema.
   No backend changes.
   ======================================================================== */

function AgentRadarChart({ agents, agentIds }) {
  const [hovered, setHovered] = useState(null);

  const SIZE = 320;
  const CENTER = SIZE / 2;
  const RADIUS = 105;

  const count = agentIds.length;

  const getPoint = (index, radius) => {
    const angle =
      -Math.PI / 2 +
      (index / count) * Math.PI * 2;

    return {
      x: CENTER + Math.cos(angle) * radius,
      y: CENTER + Math.sin(angle) * radius,
    };
  };

  const getScore = (agentId) => {
    const score = agents?.[agentId]?.healthScore;

    if (typeof score !== 'number') {
      return null;
    }

    return Math.max(0, Math.min(100, score));
  };

  const polygonPoints = (radius) =>
    agentIds
      .map((_, index) => {
        const p = getPoint(index, radius);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  const dataPoints = agentIds
    .map((agentId, index) => {
      const score = getScore(agentId);

      const point = getPoint(
        index,
        score === null
          ? 0
          : (score / 100) * RADIUS
      );

      return {
        agentId,
        score,
        x: point.x,
        y: point.y,
      };
    });

  return (
    <div
      className="relative flex flex-col"
      style={{
        background: T.bg.card,
        minHeight: 320,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          borderBottom: `1px solid ${T.border.subtle}`,
        }}
      >
        <div>
          <span
            className="text-[10px] tracking-[0.2em] uppercase font-bold"
            style={{ color: T.text.micro }}
          >
            AGENT HEALTH
          </span>

          <div
            className="text-[9px] tracking-wider mt-1"
            style={{ color: T.text.secondary }}
          >
            12-DOMAIN PROFILE
          </div>
        </div>

        <span
          className="text-[8px] tracking-widest uppercase"
          style={{ color: T.text.micro }}
        >
          HOVER DATA
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 flex items-center justify-center p-2">
        <div
          className="relative w-full"
          style={{
            maxWidth: 320,
            aspectRatio: '1 / 1',
          }}
        >
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width="100%"
            height="100%"
            style={{
              overflow: 'visible',
            }}
          >
            {/* --------------------------------------------------------
                Radar grid
            -------------------------------------------------------- */}

            {[20, 40, 60, 80, 100].map((level) => (
              <polygon
                key={level}
                points={polygonPoints(
                  (RADIUS * level) / 100
                )}
                fill="none"
                stroke={T.border.default}
                strokeOpacity={level === 100 ? 0.28 : 0.10}
                strokeWidth={level === 100 ? 1 : 0.7}
              />
            ))}

            {/* --------------------------------------------------------
                Axis lines
            -------------------------------------------------------- */}

            {agentIds.map((_, index) => {
              const outer = getPoint(index, RADIUS);

              return (
                <line
                  key={`axis-${index}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={T.border.default}
                  strokeOpacity="0.13"
                  strokeWidth="0.7"
                />
              );
            })}

            {/* --------------------------------------------------------
                20 / 40 / 60 / 80 / 100 labels
            -------------------------------------------------------- */}

            {[20, 40, 60, 80, 100].map((level) => {
              const y =
                CENTER -
                (RADIUS * level) / 100;

              return (
                <text
                  key={`scale-${level}`}
                  x={CENTER + 4}
                  y={y - 2}
                  fontSize="6"
                  fill={T.text.micro}
                  opacity="0.7"
                  style={{
                    fontFamily: T.font.mono,
                  }}
                >
                  {level}
                </text>
              );
            })}

            {/* --------------------------------------------------------
                Actual agent health polygon
            -------------------------------------------------------- */}

            <polygon
              points={dataPoints
                .map((point) => `${point.x},${point.y}`)
                .join(' ')}
              fill={T.severity.moderate.text}
              fillOpacity="0.08"
              stroke={T.text.primary}
              strokeOpacity="0.75"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* --------------------------------------------------------
                Agent points
            -------------------------------------------------------- */}

            {dataPoints.map((point) => {
              const isHovered =
                hovered?.agentId === point.agentId;

              const meta =
                AGENT_META[point.agentId];

              const label =
                meta?.label ||
                point.agentId;

              return (
                <g
                  key={point.agentId}
                  onMouseEnter={() =>
                    setHovered({
                      agentId: point.agentId,
                      score: point.score,
                      label,
                    })
                  }
                  onMouseLeave={() =>
                    setHovered(null)
                  }
                  style={{
                    cursor: 'crosshair',
                  }}
                >
                  {/* Bigger invisible hit area */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="10"
                    fill="transparent"
                  />

                  {/* Actual point */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isHovered ? 4.5 : 3}
                    fill={
                      point.score === null
                        ? T.text.micro
                        : point.score < 35
                          ? T.severity.critical.bg
                          : point.score < 60
                            ? T.severity.moderate.text
                            : T.severity.good.text
                    }
                    stroke={T.bg.card}
                    strokeWidth="1.5"
                  />

                  {/* Hover ring */}
                  {isHovered && (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      fill="none"
                      stroke={
                        point.score === null
                          ? T.text.micro
                          : point.score < 35
                            ? T.severity.critical.bg
                            : point.score < 60
                              ? T.severity.moderate.text
                              : T.severity.good.text
                      }
                      strokeWidth="1"
                      opacity="0.55"
                    />
                  )}
                </g>
              );
            })}

            {/* --------------------------------------------------------
                Agent labels around perimeter
            -------------------------------------------------------- */}

            {agentIds.map((agentId, index) => {
              const point = getPoint(
                index,
                RADIUS + 19
              );

              const meta =
                AGENT_META[agentId];

              const label =
                meta?.label ||
                agentId;

              const angle =
                -Math.PI / 2 +
                (index / count) * Math.PI * 2;

              const cos = Math.cos(angle);

              let anchor = 'middle';

              if (cos > 0.35) anchor = 'start';
              if (cos < -0.35) anchor = 'end';

              return (
                <text
                  key={`label-${agentId}`}
                  x={point.x}
                  y={point.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize="6.5"
                  fontWeight="700"
                  fill={T.text.secondary}
                  style={{
                    fontFamily: T.font.mono,
                    letterSpacing: '0.04em',
                  }}
                >
                  {label.length > 16
                    ? `${label.slice(0, 15)}…`
                    : label}
                </text>
              );
            })}
          </svg>

          {/* ----------------------------------------------------------
              Hover data
              
              Deliberately only shows the number + agent.
          ---------------------------------------------------------- */}

          {hovered && (
            <div
              className="absolute pointer-events-none px-3 py-2"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: T.cascade.bg,
                color: T.cascade.text,
                border: `1px solid ${T.border.strong}`,
                minWidth: 105,
                textAlign: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              }}
            >
              <div
                className="text-[8px] tracking-widest uppercase"
                style={{
                  color: T.cascade.text,
                  opacity: 0.65,
                }}
              >
                {hovered.label}
              </div>

              <div
                className="text-2xl font-bold mt-0.5"
                style={{
                  color:
                    hovered.score === null
                      ? T.text.micro
                      : hovered.score < 35
                        ? T.severity.critical.bg
                        : hovered.score < 60
                          ? T.severity.moderate.text
                          : T.cascade.text,
                }}
              >
                {hovered.score === null
                  ? '—'
                  : hovered.score}
              </div>

              <div
                className="text-[7px] tracking-widest uppercase"
                style={{
                  color: T.cascade.text,
                  opacity: 0.5,
                }}
              >
                {hovered.score === null
                  ? 'NO SIGNAL'
                  : 'HEALTH / 100'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ========================================================================
   EXISTING VITAL BLOCK
   ======================================================================== */

function VitalBlock({ label, value, alert }) {
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-4"
      style={{
        background: T.bg.card,
      }}
    >
      <span
        className="text-[10px] tracking-[0.15em] uppercase font-bold"
        style={{ color: T.text.micro }}
      >
        {label}
      </span>

      <span
        className="text-2xl font-bold"
        style={{
          color: alert
            ? T.severity.critical.bg
            : T.text.primary,
        }}
      >
        {value}
      </span>
    </div>
  );
}