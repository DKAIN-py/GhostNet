import { createContext, useContext, useState } from 'react';

const ReplayContext = createContext(null);

export function ReplayProvider({ children }) {
  const [mode, setMode] = useState('live'); // 'live' | 'replay'

  function enterReplay() { setMode('replay'); }
  function exitReplay()  { setMode('live');   }

  return (
    <ReplayContext.Provider value={{ mode, enterReplay, exitReplay }}>
      {children}
    </ReplayContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReplayMode() {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error('useReplayMode must be inside ReplayProvider');
  return ctx;
}