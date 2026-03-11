import { useState } from 'react';
import './SessionManager.css';

export default function SessionManager({ socket, onSessionJoin }) {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    setLoading(true);
    socket.emit('session-create', (response) => {
      if (response.sessionId) {
        onSessionJoin(response.sessionId);
      }
      setLoading(false);
    });
  };

  const handleJoin = () => {
    if (!sessionId.trim()) {
      alert('Please enter a session ID');
      return;
    }
    setLoading(true);
    socket.emit('session-join', sessionId, (response) => {
      if (response.error) {
        alert(response.error);
        setLoading(false);
      } else {
        onSessionJoin(response.sessionId);
      }
    });
  };

  return (
    <div className="session-manager">
      <div className="session-card">
        <h1>Collaborative Whiteboard</h1>
        <p>Draw together in real-time</p>

        <div className="button-group">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Creating...' : 'New Session'}
          </button>
        </div>

        <div className="divider">OR</div>

        <div className="join-group">
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Enter session ID to join"
            className="input"
          />
          <button
            onClick={handleJoin}
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? 'Joining...' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
