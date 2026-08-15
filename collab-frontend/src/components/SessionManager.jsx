import { useState, useEffect, useRef } from 'react';
import { getClientId } from '../collab/identity';

/**
 * SessionManager — landing screen for creating or joining a collaborative session.
 * Displays session ID input, create/join buttons, and connection status.
 *
 * A socket OBJECT exists the instant io() is called; it is not usable until it has actually
 * connected. On localhost that gap is a few milliseconds and nobody ever saw it. Deployed, it
 * is a second or more — long enough to click — and clicking in that window used to set
 * "Not connected to server" and do nothing, on a button that looked ready. Hence `connected`:
 * the buttons wait for the connection rather than the object.
 *
 * @param {Object}   props
 * @param {Object}   props.socket        - Socket.io client instance
 * @param {boolean}  props.connected     - Whether that socket has actually connected
 * @param {Function} props.onSessionJoin - Called with (sessionId, sessionSnapshot, collabToken).
 *   The snapshot is the server's ack payload and is the authoritative initial state — see the
 *   comment in handleCreate for why it must not be discarded. The collabToken authorises this
 *   client's Yjs document connection and is verified server-side on every connect.
 */
export default function SessionManager({ socket, connected, onSessionJoin }) {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const [slowConnect, setSlowConnect] = useState(false);

  // Auto-focus the session input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ready = Boolean(socket && connected);

  // The backend is one always-on process on a free tier that stops itself when idle, so the
  // first visitor after a quiet spell waits for a machine to boot — measured at ~6 s. Six
  // seconds of a silent "Connecting…" reads as broken. Say what is happening instead.
  useEffect(() => {
    if (ready) return setSlowConnect(false);
    const t = setTimeout(() => setSlowConnect(true), 2500);
    return () => clearTimeout(t);
  }, [ready]);

  const handleCreate = () => {
    if (!ready) {
      setError('Not connected to server');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit('session-create', { clientId: getClientId() }, (response) => {
      if (response.sessionId) {
        // Pass the full snapshot up, not just the id. The server broadcasts `user-joined`
        // BEFORE invoking this ack, so a listener registered after this point never sees it —
        // that race is what left the creator as a viewer with ONLINE (0). The ack already
        // carries the correct sessionMembers/users; seeding from it removes the race entirely.
        onSessionJoin(response.sessionId, response.session, response.collabToken);
      }
      setLoading(false);
    });
  };

  const handleJoin = () => {
    if (!sessionId.trim()) {
      setError('Please enter a session ID');
      return;
    }
    if (!ready) {
      setError('Not connected to server');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit('session-join', { sessionId, clientId: getClientId() }, (response) => {
      if (response.error) {
        setError(response.error);
        setLoading(false);
      } else {
        // Same ack-seeding as session-create: the join broadcast races the ack identically.
        onSessionJoin(response.sessionId, response.session, response.collabToken);
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

        {!ready && slowConnect && (
          <div role="status" className="error-message">
            Waking the server — it sleeps after five minutes idle on the free tier. About six
            seconds.
          </div>
        )}

        <div className="button-group">
          <button
            onClick={handleCreate}
            disabled={loading || !ready}
            className="btn btn-primary"
            aria-label="Create a new whiteboard session"
          >
            {ready ? 'New Session' : 'Connecting…'}
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
            disabled={loading || !ready}
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
