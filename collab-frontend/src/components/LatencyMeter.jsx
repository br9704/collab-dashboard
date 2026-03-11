import { useEffect, useState } from 'react';
import './LatencyMeter.css';

export default function LatencyMeter({ socket }) {
  const [latency, setLatency] = useState(null);
  const [avgLatency, setAvgLatency] = useState(null);
  const [latencies, setLatencies] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setConnected(socket.connected);

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
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('latency-pong');
    };
  }, [socket]);

  // Determine connection quality based on average latency
  const getConnectionQuality = () => {
    if (!connected) return 'disconnected';
    if (!avgLatency) return 'unknown';
    if (avgLatency < 50) return 'good';
    if (avgLatency < 150) return 'ok';
    return 'poor';
  };

  const quality = getConnectionQuality();

  const getConnectionLabel = () => {
    if (!connected) return 'Disconnected';
    if (quality === 'unknown') return 'Connecting...';
    return 'Connected';
  };

  return (
    <div className="latency-meter">
      <div className="connection-status">
        <div className={`connection-dot ${quality}`} title={getConnectionLabel()} />
        <span className="connection-label">{getConnectionLabel()}</span>
      </div>
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

