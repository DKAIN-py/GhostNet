import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { io } from 'socket.io-client';

import { SOCKET_EVENTS } from '../lib/schema';

const SOCKET_URL =
  import.meta.env.VITE_BACKEND_URL ||
  'http://localhost:3001';

/**
 * Ghostnet Socket.io connection.
 *
 * Backend → Frontend events:
 *
 * agent-signal
 * cascade-alert
 * cascade-clear
 * agent-comms
 */
export function useSocket(
  onSignal,
  onCascade,
  onCascadeClear,
  onAgentComms
) {
  const socketRef = useRef(null);

  const [connected, setConnected] =
    useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: [
        'websocket',
        'polling',
      ],

      reconnection: true,

      reconnectionAttempts: 5,

      reconnectionDelay: 1500,
    });

    socketRef.current = socket;

    // ==========================================================
    // CONNECT
    // ==========================================================

    socket.on('connect', () => {
      console.log(
        '[GHOSTNET] Socket connected:',
        socket.id
      );

      setConnected(true);
    });

    // ==========================================================
    // DISCONNECT
    // ==========================================================

    socket.on('disconnect', (reason) => {
      console.warn(
        '[GHOSTNET] Socket disconnected:',
        reason
      );

      setConnected(false);
    });

    // ==========================================================
    // CONNECTION ERROR
    // ==========================================================

    socket.on('connect_error', (error) => {
      console.error(
        '[GHOSTNET] Socket connection error:',
        error.message
      );

      setConnected(false);
    });

    // ==========================================================
    // AGENT SIGNAL
    // ==========================================================
    //
    // AI / Python
    //       ↓
    // Node backend
    //       ↓
    // Socket.io
    //       ↓
    // THIS HANDLER
    //
    // Example:
    //
    // {
    //   agentId: "smog_dispersion",
    //   sectorId: "DEL_EAST_AV",
    //   healthScore: 24,
    //   anomalyLevel: "critical",
    //   ...
    // }
    // ==========================================================

    socket.on(
      SOCKET_EVENTS.AGENT_SIGNAL,
      (signal) => {
        console.log(
          '[GHOSTNET] Signal received:',
          signal
        );

        onSignal?.(signal);
      }
    );

    // ==========================================================
    // CASCADE ALERT
    // ==========================================================

    socket.on(
      SOCKET_EVENTS.CASCADE_ALERT,
      (data) => {
        console.warn(
          '[GHOSTNET] CASCADE ALERT:',
          data
        );

        onCascade?.(data);
      }
    );

    // ==========================================================
    // CASCADE CLEAR
    // ==========================================================

    socket.on(
      SOCKET_EVENTS.CASCADE_CLEAR,
      () => {
        console.log(
          '[GHOSTNET] Cascade cleared'
        );

        onCascadeClear?.();
      }
    );

    // ==========================================================
    // AGENT COMMUNICATION
    // ==========================================================
    //
    // Example:
    //
    // smog_dispersion
    //       ↓
    // transit_fleet
    //
    // "Visibility below 450m.
    //  Flagging speed reduction."
    //
    // This will power your live agent communication feed.
    // ==========================================================

    socket.on(
      SOCKET_EVENTS.AGENT_COMMS,
      (data) => {
        console.log(
          '[GHOSTNET] Agent communication:',
          data
        );

        onAgentComms?.(data);
      }
    );

    // ==========================================================
    // CLEANUP
    // ==========================================================

    return () => {
      console.log(
        '[GHOSTNET] Closing socket'
      );

      socket.removeAllListeners();

      socket.disconnect();

      socketRef.current = null;
    };
  }, [
    onSignal,
    onCascade,
    onCascadeClear,
    onAgentComms,
  ]);

  return {
    connected,
    socket: socketRef.current,
  };
}