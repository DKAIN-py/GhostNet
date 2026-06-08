import { createContext, useCallback, useContext, useReducer } from 'react';
import { useSocket } from '../hooks/useSocket';
import { MOCK_SIGNALS, MOCK_CASCADE } from '../lib/schema';

const initialState = {
  signals: {
    air_quality: MOCK_SIGNALS[0],
    transport:   MOCK_SIGNALS[1],
    sentiment:   MOCK_SIGNALS[2],
  },
  feed:           [...MOCK_SIGNALS].reverse(),
  cascade:        null,
  cascadeHistory: [],
  connected:      false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SIGNAL_RECEIVED': {
      const sig = action.payload;
      return {
        ...state,
        signals: { ...state.signals, [sig.agentId]: sig },
        feed: [sig, ...state.feed].slice(0, 50),
      };
    }
    case 'CASCADE_FIRED':
      return {
        ...state,
        cascade: action.payload,
        cascadeHistory: [action.payload, ...state.cascadeHistory],
      };
    case 'CASCADE_CLEARED':
      return { ...state, cascade: null };
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    default:
      return state;
  }
}

const GhostnetContext = createContext(null);

export function GhostnetProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleSignal       = useCallback((s) => dispatch({ type: 'SIGNAL_RECEIVED', payload: s }), []);
  const handleCascade      = useCallback((d) => dispatch({ type: 'CASCADE_FIRED',   payload: d }), []);
  const handleCascadeClear = useCallback(()  => dispatch({ type: 'CASCADE_CLEARED'             }), []);

  const { connected } = useSocket(handleSignal, handleCascade, handleCascadeClear);

  if (state.connected !== connected) {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }

  function fireFakeCascade() { dispatch({ type: 'CASCADE_FIRED',   payload: MOCK_CASCADE }); }
  function clearCascade()    { dispatch({ type: 'CASCADE_CLEARED'                        }); }
  function pushMockSignal(s) { dispatch({ type: 'SIGNAL_RECEIVED', payload: s            }); }

  return (
    <GhostnetContext.Provider value={{ ...state, connected, fireFakeCascade, clearCascade, pushMockSignal }}>
      {children}
    </GhostnetContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGhostnet() {
  const ctx = useContext(GhostnetContext);
  if (!ctx) throw new Error('useGhostnet must be used inside GhostnetProvider');
  return ctx;
}