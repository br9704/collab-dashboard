import React, { useEffect, useState } from 'react';
import './LatencyMeter.css';

export default function LatencyMeter({ socket }) {
  const [latency, setLatency] = useState(null);
  const [avgLatency, setAvgLatency] = useState(null);
  const [latencies, setLatencies] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const measureLatency = () => {
      const clientTime = Date.now();
      socket.emit('latency-ping', { clientTime });
    };

    socket.on('latency-pong', (data) => {
      const latency = Date.now() - data.clientTime;
      setLatency(latency);

      // Keep last 20 measurements for average
      setLatencies(prev => {
        const updated = [...prev, latency];
        if (updated.length > 20) {
          updated.shift();
        }
        const avg = Math.round(updated.reduce((a, b) => a + b, 0) / updated.length);
        setAvgLatency(avg);
        return updated;
      });
    });

    // Measure every 500ms
    const interval = setInterval(measureLatency, 500);

    return () => {
      clearInterval(interval);
      socket.off('latency-pong');
    };
  }, [socket]);

  return (
    <div className="latency-meter">
      <div className="latency-value">
        {latency ? `${latency}ms` : '—'}
      </div>
      {avgLatency && (
        <div className="latency-avg">
          Avg: {avgLatency}ms
        </div>
      )}
    </div>
  );
}
