import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '../lib/schema';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * useSocket — manages Socket.io connection lifecycle.
 * Returns { connected, socket } — components use GhostnetContext
 * instead of calling this hook directly.
 */
export function useSocket(onSignal, onCascade, onCascadeClear) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[GHOSTNET] Socket connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[GHOSTNET] Socket disconnected:', reason);
      setConnected(false);
    });

    socket.on(SOCKET_EVENTS.AGENT_SIGNAL, (signal) => {
      console.log('[GHOSTNET] Signal received:', signal);
      onSignal?.(signal);
    });

    socket.on(SOCKET_EVENTS.CASCADE_ALERT, (data) => {
      console.warn('[GHOSTNET] CASCADE ALERT:', data);
      onCascade?.(data);
    });

    socket.on(SOCKET_EVENTS.CASCADE_CLEAR, () => {
      console.log('[GHOSTNET] Cascade cleared');
      onCascadeClear?.();
    });

    return () => {
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, socket: socketRef.current };
}