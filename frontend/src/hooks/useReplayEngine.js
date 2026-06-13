import { useState, useRef, useCallback, useEffect } from 'react';
import { DELHI_NOV_2023, REPLAY_CASCADE, CASCADE_FIRE_INDEX } from '../lib/replayData';

const SPEED_OPTIONS = [1, 2, 5, 10];

export function useReplayEngine({ onSignal, onCascade, onCascadeClear, onComplete }) {
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed,        setSpeed]        = useState(5); // default 5x
  const [cascadeFired, setCascadeFired] = useState(false);
  const [completed,    setCompleted]    = useState(false);

  const intervalRef  = useRef(null);
  const indexRef     = useRef(0);
  const cascadeRef   = useRef(false);

  const total = DELHI_NOV_2023.length;

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const idx = indexRef.current;

    if (idx >= total) {
      stop();
      setCompleted(true);
      onComplete?.();
      return;
    }

    const signal = DELHI_NOV_2023[idx];
    onSignal?.(signal);
    setCurrentIndex(idx);
    indexRef.current = idx + 1;

    // Fire cascade at the right moment
    if (idx >= CASCADE_FIRE_INDEX && !cascadeRef.current) {
      cascadeRef.current = true;
      setCascadeFired(true);
      onCascade?.(REPLAY_CASCADE);
    }
  }, [total, stop, onSignal, onCascade, onComplete]);

  const play = useCallback(() => {
    if (indexRef.current >= total) return;
    setIsPlaying(true);
    setCompleted(false);
    // Interval: 800ms base ÷ speed multiplier
    intervalRef.current = setInterval(tick, Math.round(800 / speed));
  }, [tick, speed, total]);

  const pause = useCallback(() => stop(), [stop]);

  const reset = useCallback(() => {
    stop();
    indexRef.current  = 0;
    cascadeRef.current = false;
    setCurrentIndex(0);
    setCascadeFired(false);
    setCompleted(false);
    onCascadeClear?.();
  }, [stop, onCascadeClear]);

  const seekTo = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, total - 1));
    stop();
    indexRef.current = clamped;
    setCurrentIndex(clamped);
    // Re-evaluate cascade state at this point
    if (clamped >= CASCADE_FIRE_INDEX) {
      cascadeRef.current = true;
      setCascadeFired(true);
      onCascade?.(REPLAY_CASCADE);
    } else {
      cascadeRef.current = false;
      setCascadeFired(false);
      onCascadeClear?.();
    }
  }, [stop, total, onCascade, onCascadeClear]);

  const changeSpeed = useCallback((s) => {
    setSpeed(s);
    if (isPlaying) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, Math.round(800 / s));
    }
  }, [isPlaying, tick]);

  // Cleanup on unmount
  useEffect(() => () => clearInterval(intervalRef.current), []);

  const progress = total > 0 ? Math.round((currentIndex / (total - 1)) * 100) : 0;
  const currentSignal = DELHI_NOV_2023[currentIndex];

  return {
    isPlaying,
    currentIndex,
    progress,
    speed,
    cascadeFired,
    completed,
    currentSignal,
    total,
    speedOptions: SPEED_OPTIONS,
    play,
    pause,
    reset,
    seekTo,
    changeSpeed,
  };
}