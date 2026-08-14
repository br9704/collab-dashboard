import { useState, useEffect, useRef } from 'react';
import './SessionManager.css';

/**
 * SessionManager — landing screen for creating or joining a collaborative session.
 * Displays session ID input, create/join buttons, and connection status.
 *
 * @param {Object}   props
 * @param {Object}   props.socket        - Socket.io client instance
 * @param {Function} props.onSessionJoin - Called with (sessionId, sessionSnapshot) when the
 *   user creates or joins. The snapshot is the server's ack payload and is the authoritative
 *   initial state — see the comment in handleCreate for why it must not be discarded.
 */
export default function SessionManager({ socket, onSessionJoin }) {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Auto-focus the session input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCreate = () => {
    if (!socket) {
      setError('Not connected to server');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit('session-create', (response) => {
      if (response.sessionId) {
        // Pass the full snapshot up, not just the id. The server broadcasts `user-joined`
        // BEFORE invoking this ack, so a listener registered after this point never sees it —
        // that race is what left the creator as a viewer with ONLINE (0). The ack already
        // carries the correct sessionMembers/users; seeding from it removes the race entirely.
        onSessionJoin(response.sessionId, response.session);
      }
      setLoading(false);
    });
  };

  const handleJoin = () => {
    if (!sessionId.trim()) {
      setError('Please enter a session ID');
      return;
    }
    if (!socket) {
      setError('Not connected to server');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit('session-join', sessionId, (response) => {
      if (response.error) {
        setError(response.error);
        setLoading(false);
      } else {
        // Same ack-seeding as session-create: the join broadcast races the ack identically.
        onSessionJoin(response.sessionId, response.session);
      }
    });
  };

  return (
    <div className="session-manager">
      <div className="session-card">
        <h1>Collaborative Whiteboard</h1>
        <p>Draw together in real-time</p>

        {error && (
          <div role="alert" className="error-message">
            {error}
          </div>
        )}

        <div className="button-group">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn btn-primary"
            aria-label="Create a new whiteboard session"
          >
            New Session
          </button>
        </div>

        <div className="divider">OR</div>

        <div className="join-group">
          <input
            ref={inputRef}
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Enter session ID to join"
            className="input"
            aria-label="Session ID input - Enter an existing session ID to join"
          />
          <button
            onClick={handleJoin}
            disabled={loading}
            className="btn btn-secondary"
            aria-label="Join the session with the provided ID"
          >
            Join
          </button>
        </div>

        {/* Loading overlay with spinner */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p className="loading-text">
              {sessionId ? 'Joining session...' : 'Creating session...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
