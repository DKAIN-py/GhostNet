import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';
import { AGENT_META } from '../../lib/schema';
import { cityStatusStyle, timeAgo } from '../../lib/citySeverity';
import CityIncidentDrawer from './CityIncidentDrawer';

// IMPORTANT: this reads `cityIncident` (the confirmed/manually-fired one,
// persisted in state until acknowledged) — NOT `liveCityIncident`, which
// recomputes on every signal tick and would flicker in/out as the mesh
// jitters. In real operation the backend only pushes a city-incident event
// ~every 30 minutes, so this panel shows exactly one stable result and
// stays there until cleared.
export default function CityCascadePanel() {
  const { cityIncident, cityIncidentHistory, clearCityIncident } = useGhostnet();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const incident = cityIncident;
  const style = cityStatusStyle(incident?.citywideSeverity);
  // style.bg / style.text are a matched pair for the dark colored header
  // strip only (light text on a dark/tinted fill). Everything below that —
  // sitting on the plain cream card body — needs style.border instead,
  // which is a mid/dark saturated color that's actually readable on light
  // backgrounds. Mixing these up is what made the gauge fill and CTA
  // button invisible before.
  const accent = style.border;

  const districts = useMemo(() => {
    if (!incident) return [];
    return [...new Set(incident.affectedAreas.map((a) => a.district))];
  }, [incident]);

  const rootDomainLabel = useMemo(() => {
    if (!incident) return null;
    return AGENT_META[incident.rootCauseDomain]?.label || incident.rootCauseDomain.replaceAll('_', ' ');
  }, [incident]);

  if (!incident) {
    return (
      <div className="flex items-center justify-between px-5 py-6" style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
        <div>
          <span className="text-sm font-bold tracking-wide uppercase" style={{ color: T.text.primary }}>City nominal</span>
          <p className="text-[11px] mt-1" style={{ color: T.text.micro }}>
            No confirmed city incident yet. Backend pushes one roughly every 30 minutes, or fire a test one from the demo panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ border: `2px solid ${accent}`, background: T.bg.card, fontFamily: T.font.mono }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.border.subtle}`, background: style.bg }}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1" style={{ border: `1px solid ${style.text}`, color: style.text }}>
              {incident.citywideSeverity}
            </span>
            <span className="text-sm font-bold tracking-wide" style={{ color: style.text }}>City Cascade</span>
          </div>
          <span className="text-[10px] tracking-wide" style={{ color: style.text, opacity: 0.75 }}>
            confirmed {timeAgo(incident.timestamp)}
          </span>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 relative overflow-hidden" style={{ background: T.border.subtle }}>
              <div className="h-full transition-all duration-700" style={{ width: `${Math.round(incident.citywideCascadeScore * 100)}%`, background: accent }} />
            </div>
            <span className="text-lg font-bold shrink-0" style={{ color: T.text.primary }}>
              {incident.citywideCascadeScore.toFixed(2)}
            </span>
          </div>

          <p className="text-[13px] leading-relaxed" style={{ color: T.text.secondary }}>
            {incident.summary}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[10px] tracking-widest uppercase font-bold px-2 py-1"
              style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface }}
            >
              root cause · {rootDomainLabel}
            </span>
            {districts.slice(0, 5).map((d) => (
              <button
                key={d}
                onClick={() => navigate(`/sectors?district=${encodeURIComponent(d)}`)}
                className="text-[10px] tracking-wide px-2 py-1 transition-all"
                style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {d}
              </button>
            ))}
            {districts.length > 5 && (
              <span className="text-[10px]" style={{ color: T.text.micro }}>+{districts.length - 5} more</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-[11px] tracking-widest uppercase px-4 py-2 font-bold transition-all"
                style={{ border: `1px solid ${accent}`, color: T.bg.card, background: accent, fontFamily: T.font.mono, cursor: 'pointer' }}
              >
                View Full City Incident
              </button>
              <button
                onClick={clearCityIncident}
                className="text-[11px] tracking-widest uppercase px-3.5 py-2 font-bold transition-all"
                style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: 'transparent', fontFamily: T.font.mono, cursor: 'pointer' }}
              >
                Acknowledge &amp; Clear
              </button>
            </div>
            <button
              onClick={() => navigate('/cascade')}
              className="text-[10px] tracking-widest uppercase"
              style={{ color: T.text.micro, background: 'transparent', border: 'none', fontFamily: T.font.mono, cursor: 'pointer' }}
            >
              History ({cityIncidentHistory?.length ?? 0}) →
            </button>
          </div>
        </div>
      </div>

      {drawerOpen && <CityIncidentDrawer incident={incident} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}