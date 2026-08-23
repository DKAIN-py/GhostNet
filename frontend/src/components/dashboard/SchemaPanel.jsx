import { T } from '../../lib/theme';
import { MOCK_SIGNALS } from '../../lib/schema';

const EXAMPLE = MOCK_SIGNALS[0];

export default function SchemaPanel() {
  const lines = [
    { key: 'agentId',      val: `"${EXAMPLE.agentId}"`,      type: 'str'  },
    { key: 'domain',       val: `"${EXAMPLE.domain}"`,        type: 'str'  },
    { key: 'healthScore',  val: EXAMPLE.healthScore,          type: 'num'  },
    { key: 'anomalyLevel', val: `"${EXAMPLE.anomalyLevel}"`,  type: 'str'  },
    { key: 'signal',       val: `"${EXAMPLE.signal}"`,        type: 'str'  },
    { key: 'timestamp',    val: `"ISO string"`,               type: 'meta' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[9px] tracking-[0.25em] uppercase" style={{ color: T.text.micro }}>
          SIGNAL SCHEMA · LOCKED
        </span>
        <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
          style={{ background: T.cascade.bg, color: T.cascade.text }}>
          DAY 1
        </span>
      </div>

      <div className="px-4 py-3 flex-1">
        <div className="p-3" style={{ border: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
          <pre className="text-[10px] leading-6 m-0 whitespace-pre-wrap" style={{ color: T.text.muted }}>
            {'{\n'}
            {lines.map((l, i) => (
              <span key={l.key}>
                {'  '}
                <span style={{ color: T.text.secondary }}>"{l.key}"</span>
                <span style={{ color: T.text.muted }}>: </span>
                <span style={{ color: l.type === 'num' ? T.text.muted : T.text.primary }}>
                  {String(l.val)}
                </span>
                <span style={{ color: T.border.default }}>{i < lines.length - 1 ? ',' : ''}{'\n'}</span>
              </span>
            ))}
            {'}'}
          </pre>
        </div>

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