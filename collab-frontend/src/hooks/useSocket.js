import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export function useSocket(url = 'http://localhost:3001') {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(url, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling']
      });

      socketRef.current.on('connect', () => {
        console.log('[SOCKET] Connected:', socketRef.current.id);
        setConnected(true);
        setError(null);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('[SOCKET] Disconnected:', reason);
        setConnected(false);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('[SOCKET] Error:', error.message);
        setError(error.message);
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
    error
  };
}
