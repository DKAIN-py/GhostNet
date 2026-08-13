import { T } from '../../lib/theme';
import { MOCK_SIGNALS, MOCK_CASCADE } from '../../lib/schema';

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

export default function SchemaPanel() {
  return (
    <div className="flex flex-col h-full" style={{ fontFamily: T.font.mono }}>
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}
      >
        <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
          SIGNAL SCHEMA · LOCKED
        </span>
        <span
          className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
          style={{ background: T.cascade.bg, color: T.cascade.text }}
        >
          v4 · 39×12
        </span>
      </div>

      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <p className="text-[8px] tracking-widest uppercase mb-1" style={{ color: T.text.micro }}>
          agent-signal
        </p>
        <SchemaBlock lines={SIGNAL_LINES} />

        <p className="text-[8px] tracking-widest uppercase mt-4 mb-1" style={{ color: T.text.micro }}>
          cascade-alert
        </p>
        <SchemaBlock lines={CASCADE_LINES} />

        <div className="mt-3 flex flex-col gap-1">
          <p className="text-[9px] tracking-widest uppercase mb-1" style={{ color: T.text.micro }}>
            Socket.io events
          </p>
          {['agent-signal', 'cascade-alert', 'cascade-clear', 'agent-comms'].map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-[9px] w-8" style={{ color: T.text.micro }}>emit</span>
              <span className="text-[10px]" style={{ color: T.text.secondary }}>→ {name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemaBlock({ lines }) {
  return (
    <div className="p-3" style={{ border: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
      <pre className="text-[10px] leading-6 m-0 whitespace-pre-wrap break-all" style={{ color: T.text.muted }}>
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
  );
}