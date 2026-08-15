import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
// The default lives in one place. It used to be a second hardcoded copy of
// 'http://localhost:3001', which meant fixing the URL in App.jsx alone left a stale
// fallback behind.
import { SOCKET_URL as DEFAULT_SOCKET_URL } from '../config';

/**
 * useSocket — manages a persistent Socket.io connection with automatic reconnection.
 * Handles connect/disconnect/error events and exposes connection state.
 *
 * @param {string} [url] - Socket.io server URL; defaults to VITE_SOCKET_URL
 * @returns {{ socket: Object|null, connected: boolean, error: string|null, reconnectAttempt: number }}
 */
export function useSocket(url = DEFAULT_SOCKET_URL) {
  const socketRef = useRef(null);
  const urlRef = useRef(url);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    // If URL changed, cleanup old socket and create new one
    if (urlRef.current !== url && socketRef.current) {
      console.log('[SOCKET] URL changed, cleaning up old socket');
      socketRef.current.disconnect();
      socketRef.current = null;
      urlRef.current = url;
    }

    if (!socketRef.current) {
      socketRef.current = io(url, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling']
      });

      // `benchmarks/sync-latency.cjs` reports the socket round trip alongside the end-to-end
      // number, precisely to keep the two apart. It reaches the socket through this handle.
      // Dev builds only — it is not present in a production bundle.
      if (import.meta.env.DEV) window.__socketForTest = socketRef.current;

      socketRef.current.on('connect', () => {
        console.log('[SOCKET] Connected:', socketRef.current.id);
        setConnected(true);
        setError(null);
        setReconnectAttempt(0);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('[SOCKET] Disconnected:', reason);
        setConnected(false);
      });

      socketRef.current.on('reconnect_attempt', (attemptNumber) => {
        console.log(`[SOCKET] Reconnection attempt ${attemptNumber}`);
        setReconnectAttempt(attemptNumber);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('[SOCKET] Error:', error.message);
        setError(error.message);
      });

      socketRef.current.on('reconnect_failed', () => {
        console.error('[SOCKET] Reconnection failed after max attempts');
        setError('Unable to connect to server. Please refresh the page.');
      });
    }

    return () => {
      // Don't disconnect
    };
  }, [url]);

  return {
    socket: socketRef.current,
    connected,
    sessionId,
    setSessionId,
    error,
    reconnectAttempt
  };
}
