import { useEffect, useState } from 'react';
import { useGhostnet } from '../context/GhostnetContext';

const HISTORY_LEN = 10;

export function useSparklineData() {
  const { allSignals } = useGhostnet();
  const [history, setHistory] = useState({});

  useEffect(() => {
    if (!allSignals?.length) return;

    setHistory((prev) => {
      const updated = { ...prev };

      allSignals.forEach((sig) => {
        if (!sig || typeof sig.healthScore !== 'number') return;

        const key = `${sig.sectorId}:${sig.agentId}`;
        const current = prev[key];

        // First backend signal:
        // initialize a straight line using the current score.
        if (!current || current.length === 0) {
          updated[key] = Array(HISTORY_LEN).fill(sig.healthScore);
          return;
        }

        // Only append when the backend actually gives us
        // a different reading.
        const last = current[current.length - 1];

        if (last !== sig.healthScore) {
          updated[key] = [
            ...current,
            sig.healthScore,
          ].slice(-HISTORY_LEN);
        }
      });

      return updated;
    });
  }, [allSignals]);

  return history;
}