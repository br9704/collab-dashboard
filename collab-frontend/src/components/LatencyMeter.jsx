import { useEffect, useRef, useState } from 'react';

/**
 * LatencyMeter — live round-trip latency, as an instrument readout.
 *
 * MOTION.md: "counts between values rather than jumping, and only updates twice per second
 * max." A number that flickers on every packet is noise, not information — and at ~0.3ms on
 * loopback the raw value changes on literally every sample. So the displayed figure eases
 * toward the measured one and is committed to React at most twice a second.
 *
 * It also fixes a listener leak: `socket.on('latency-pong', …)` was registered inside an
 * effect that never removed it, so every re-run added another handler.
 *
 * @param {Object} props.socket - Socket.io client instance
 */

const PING_MS = 2000;
const UPDATE_MS = 500;   // twice per second, per MOTION.md
const EASE = 0.35;

export default function LatencyMeter({ socket }) {
  const [shown, setShown] = useState(null);
  const [avg, setAvg] = useState(null);
  const [connected, setConnected] = useState(false);

  const measuredRef = useRef(null);
  const displayedRef = useRef(null);
  const samplesRef = useRef([]);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPong = (data) => {
      const rtt = Date.now() - data.clientTime;
      measuredRef.current = rtt;

      const s = samplesRef.current;
      s.push(rtt);
      if (s.length > 20) s.shift();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('latency-pong', onPong);
    setConnected(socket.connected);

    const ping = () => socket.emit('latency-ping', { clientTime: Date.now() });
    ping();
    const pingTimer = setInterval(ping, PING_MS);

    // Count toward the measured value instead of snapping to it.
    const tickTimer = setInterval(() => {
      const target = measuredRef.current;
      if (target === null) return;
      const current = displayedRef.current;
      displayedRef.current = current === null ? target : current + (target - current) * EASE;

      setShown(Math.round(displayedRef.current * 10) / 10);
      const s = samplesRef.current;
      if (s.length) setAvg(Math.round(s.reduce((a, b) => a + b, 0) / s.length));
    }, UPDATE_MS);

    return () => {
      // Named handlers, removed individually — a bare socket.off(event) would unhook
      // every other component listening to the same event.
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('latency-pong', onPong);
      clearInterval(pingTimer);
      clearInterval(tickTimer);
    };
  }, [socket]);

  return (
    <div className="latency-meter" role="status" aria-live="off">
      <span className="connection-status">
        <span className={`connection-dot ${connected ? '' : 'disconnected'}`} />
        <span className="connection-label">
          {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
      </span>
      <span className="latency-value" aria-label={`Round-trip latency ${shown ?? 0} milliseconds`}>
        {shown === null ? '—' : `${shown}ms`}
      </span>
      <span className="latency-avg">{avg === null ? '' : `avg ${avg}ms`}</span>
    </div>
  );
}
