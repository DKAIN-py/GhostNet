import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../context/GhostnetContext';
import { T } from '../lib/theme';
import { cityStatusStyle, timeAgo } from '../lib/citySeverity';
import CityIncidentDrawer from '../components/dashboard/CityIncidentDrawer';

export default function CascadeLog() {
  const { cascadeHistory, cascades, cityIncident, cityIncidentHistory, fireFakeCascade, fireFakeCityIncident } = useGhostnet();
  const [tab, setTab] = useState('sector');
  const [drawerIncident, setDrawerIncident] = useState(null);

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl tracking-[0.1em] uppercase font-bold" style={{ color: T.text.primary }}>Cascade Log</h1>
          <p className="text-[11px] tracking-widest mt-1 uppercase" style={{ color: T.text.micro }}>
            {tab === 'sector' ? `${cascadeHistory.length} sector events this session` : `${cityIncidentHistory.length} city incidents this session`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2" style={{ borderBottom: `1px solid ${T.border.default}` }}>
        <TabButton label="SECTOR" active={tab === 'sector'} onClick={() => setTab('sector')} />
        <TabButton label="CITY" active={tab === 'city'} onClick={() => setTab('city')} />
      </div>

      {tab === 'sector' ? (
        <SectorTab cascades={cascades} cascadeHistory={cascadeHistory} />
      ) : (
        <CityTab
          cityIncident={cityIncident}
          cityIncidentHistory={cityIncidentHistory}
          onView={(incident) => setDrawerIncident(incident)}
        />
      )}

      {drawerIncident && <CityIncidentDrawer incident={drawerIncident} onClose={() => setDrawerIncident(null)} />}
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] tracking-widest uppercase font-bold px-4 py-2.5 -mb-px transition-all"
      style={{
        color: active ? T.text.primary : T.text.micro,
        borderBottom: active ? `2px solid ${T.border.strong}` : '2px solid transparent',
        background: 'transparent',
        border: 'none',
        borderBottomWidth: '2px',
        borderBottomStyle: 'solid',
        borderBottomColor: active ? T.border.strong : 'transparent',
        fontFamily: T.font.mono,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function SectorTab({ cascades, cascadeHistory }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      {/* Currently active — the live, up-to-39 derived list */}
      <div>
        <SectionHeader title="Currently Active" count={cascades?.length ?? 0} />
        {!cascades || cascades.length === 0 ? (
          <EmptyState text="No sector cascades active right now" />
        ) : (
          <div className="flex flex-col gap-2">
            {cascades.map((c) => (
              <button
                key={c.primarySectorId}
                onClick={() => navigate(`/sectors/${c.primarySectorId}`)}
                className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-all"
                style={{ border: `1px solid ${T.cascade.border}`, background: T.cascade.bg, fontFamily: T.font.mono, cursor: 'pointer' }}
              >
                <div className="min-w-0">
                  <span className="text-[12px] tracking-wide uppercase font-bold block truncate" style={{ color: T.cascade.text }}>
                    ▲ {c.primarySectorName || c.primarySectorId}
                  </span>
                  <span className="text-[10px] truncate block mt-0.5" style={{ color: 'rgba(252,250,245,0.6)' }}>
                    {c.predictedEvent} · {c.confidence}% confidence
                  </span>
                </div>
                <span className="text-xl font-bold shrink-0" style={{ color: T.cascade.text }}>{Math.round(c.cascadeScore * 100)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full history */}
      <div>
        <SectionHeader title="History" count={cascadeHistory.length} />
        {cascadeHistory.length === 0 ? (
          <EmptyState text="No cascades recorded — fire a test cascade to see it logged here" />
        ) : (
          <div className="flex flex-col gap-3">
            {cascadeHistory.map((c, i) => (
              <SectorCascadeEntry key={`${c.alertId ?? c.timestamp}-${i}`} cascade={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectorCascadeEntry({ cascade, index }) {
  const isLatest = index === 0;
  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        background: isLatest ? T.cascade.bg : T.bg.card,
        border: isLatest ? `2px solid ${T.cascade.border}` : `1px solid ${T.border.subtle}`,
        color: isLatest ? T.cascade.text : T.text.primary,
        fontFamily: T.font.mono,
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: isLatest ? T.cascade.text : T.text.primary }}>
            ▲ {cascade.primarySectorName || cascade.primarySectorId || 'CASCADE'}
          </span>
          {isLatest && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold" style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text }}>
              LATEST
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: isLatest ? 'rgba(252,250,245,0.5)' : T.text.micro }}>
          {cascade.timestamp ? new Date(cascade.timestamp).toLocaleString('en-IN', { hour12: false }) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="CONFIDENCE" value={`${cascade.confidence ?? '—'}%`} isLatest={isLatest} />
        <Stat label="HOURS UNTIL" value={cascade.hoursUntil ? `~${cascade.hoursUntil}h` : '—'} isLatest={isLatest} />
        <Stat label="SCORE" value={cascade.cascadeScore != null ? cascade.cascadeScore.toFixed(2) : '—'} isLatest={isLatest} />
        <Stat label="AGENTS" value={cascade.triggeredAgents?.length ? cascade.triggeredAgents.join(', ') : '—'} isLatest={isLatest} />
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: isLatest ? 'rgba(252,250,245,0.75)' : T.text.secondary }}>
        {cascade.predictedEvent}
        {cascade.recommendations?.[0] ? ` — → ${cascade.recommendations[0]}` : ''}
      </p>
    </div>
  );
}

function CityTab({ cityIncident, cityIncidentHistory, onView }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionHeader title="Currently Confirmed" count={cityIncident ? 1 : 0} />
        {!cityIncident ? (
          <EmptyState text="No confirmed city incident right now" />
        ) : (
          <CityIncidentEntry incident={cityIncident} isLatest onView={() => onView(cityIncident)} />
        )}
      </div>

      <div>
        <SectionHeader title="History" count={cityIncidentHistory.length} />
        {cityIncidentHistory.length === 0 ? (
          <EmptyState text="No city incidents recorded — fire a test one to see it logged here" />
        ) : (
          <div className="flex flex-col gap-3">
            {cityIncidentHistory.map((inc, i) => (
              <CityIncidentEntry key={`${inc.incidentId ?? inc.timestamp}-${i}`} incident={inc} isLatest={i === 0} onView={() => onView(inc)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CityIncidentEntry({ incident, isLatest, onView }) {
  const style = cityStatusStyle(incident.citywideSeverity);
  const accent = style.border;

  return (
    <div className="flex flex-col gap-3 p-4" style={{ border: `${isLatest ? 2 : 1}px solid ${isLatest ? accent : T.border.subtle}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1" style={{ border: `1px solid ${accent}`, color: accent }}>
            {incident.citywideSeverity}
          </span>
          {isLatest && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold" style={{ border: `1px solid ${T.text.primary}`, color: T.text.primary }}>
              LATEST
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: T.text.micro }}>{timeAgo(incident.timestamp)}</span>
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: T.text.secondary }}>{incident.summary}</p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold" style={{ color: T.text.primary }}>Score: {incident.citywideCascadeScore?.toFixed(2)}</span>
        <button
          onClick={onView}
          className="text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold transition-all"
          style={{ border: `1px solid ${accent}`, color: T.bg.card, background: accent, fontFamily: T.font.mono, cursor: 'pointer' }}
        >
          View Full Incident
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, isLatest }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] tracking-widest uppercase font-bold" style={{ color: isLatest ? 'rgba(252,250,245,0.45)' : T.text.micro }}>{label}</span>
      <span className="text-[12px] font-bold leading-tight truncate" style={{ color: isLatest ? T.cascade.text : T.text.primary }} title={String(value)}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>{title}</span>
      <span className="text-[10px]" style={{ color: T.text.micro }}>{count}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="px-4 py-6 text-center" style={{ border: `1px dashed ${T.border.subtle}` }}>
      <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>{text}</span>
    </div>
  );
}