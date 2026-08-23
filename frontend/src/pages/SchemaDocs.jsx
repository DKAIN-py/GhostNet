import { useNavigate } from 'react-router-dom';
import { T } from '../lib/theme';
import { MOCK_SIGNALS, MOCK_CASCADE } from '../lib/schema';

const EXAMPLE = MOCK_SIGNALS.find((s) => s.anomalyLevel === 'critical') || MOCK_SIGNALS[0];
const forecastKey = Object.keys(EXAMPLE).find((k) => k.endsWith('Forecast'));

function renderVal(v) {
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object' && v !== null) return '{ ... }';
  return String(v);
}

const SIGNAL_LINES = [
  ['sectorId', EXAMPLE.sectorId],
  ['district', EXAMPLE.district],
  ['agentId', EXAMPLE.agentId],
  ['domain', EXAMPLE.domain],
  ['isLiveAnchor', EXAMPLE.isLiveAnchor],
  ['healthScore', EXAMPLE.healthScore],
  ['anomalyLevel', EXAMPLE.anomalyLevel],
  ['signal', EXAMPLE.signal],
  ['location', '{ placeName, lat, lng, radiusMeters }'],
  ['metrics', '{ ...agent-specific }'],
  [forecastKey || 'xForecast', '{ ...predictive }'],
  ['timestamp', 'ISO string'],
];

const CASCADE_LINES = [
  ['alertId', MOCK_CASCADE.alertId],
  ['primarySectorId', MOCK_CASCADE.primarySectorId],
  ['primarySectorName', MOCK_CASCADE.primarySectorName],
  ['district', MOCK_CASCADE.district],
  ['cascadeScore', MOCK_CASCADE.cascadeScore],
  ['confidence', MOCK_CASCADE.confidence],
  ['predictedEvent', MOCK_CASCADE.predictedEvent],
  ['hoursUntil', MOCK_CASCADE.hoursUntil],
  ['spatialSpread', '[ sectorId, ... ]'],
  ['triggeredAgents', '[ agentId, ... ]'],
  ['recommendations', '[ string, ... ]'],
];

const CITY_INCIDENT_LINES = [
  ['incidentId', 'string'],
  ['citywideSeverity', 'NOMINAL | ELEVATED | HIGH | CRITICAL'],
  ['citywideCascadeScore', '0.0 – 1.0'],
  ['summary', 'string'],
  ['rootCauseDomain', 'agentId enum'],
  ['affectedAreas', '[ { district, primarySectorId, secondarySectors, impactedDomains, affectedBy } ]'],
  ['mitigationMeasures', '{ immediateDirectives, trafficAndTransitRerouting, publicAdvisories }'],
  ['timestamp', 'ISO string'],
];

export default function SchemaDocs() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 h-full overflow-y-auto" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: T.text.micro, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
        >
          ← Back
        </button>
        <h1 className="text-xl sm:text-2xl tracking-[0.08em] uppercase font-bold" style={{ color: T.text.primary }}>Data Contract</h1>
        <p className="text-[11px] tracking-widest mt-1 uppercase" style={{ color: T.text.micro }}>Signal, sector cascade & city incident schema · v4 · 39×12</p>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4" style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}>
        <SchemaGroup label="agent-signal" lines={SIGNAL_LINES} />
        <SchemaGroup label="cascade-alert (per sector)" lines={CASCADE_LINES} />
        <SchemaGroup label="city-incident (aggregated)" lines={CITY_INCIDENT_LINES} />

        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] tracking-widest uppercase font-bold mb-1" style={{ color: T.text.secondary }}>Socket.io events</p>
          {['agent-signal', 'cascade-alert', 'cascade-clear', 'city-incident', 'agent-comms'].map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-[10px] w-9" style={{ color: T.text.micro }}>emit</span>
              <span className="text-[11px]" style={{ color: T.text.secondary }}>→ {name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemaGroup({ label, lines }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase font-bold mb-1.5" style={{ color: T.text.secondary }}>{label}</p>
      <div className="p-3" style={{ border: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
        <pre className="text-[11px] leading-7 m-0 whitespace-pre-wrap break-all" style={{ color: T.text.muted }}>
          {'{\n'}
          {lines.map(([key, val], i) => (
            <span key={key}>
              {'  '}
              <span style={{ color: T.text.secondary }}>"{key}"</span>
              <span style={{ color: T.text.muted }}>: </span>
              <span style={{ color: T.text.primary }}>{renderVal(val)}</span>
              <span style={{ color: T.border.default }}>{i < lines.length - 1 ? ',' : ''}{'\n'}</span>
            </span>
          ))}
          {'}'}
        </pre>
      </div>
    </div>
  );
}