import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useSessionState } from './hooks/useSessionState';
import SessionManager from './components/SessionManager';
import Canvas from './components/Canvas';
import UserList from './components/UserList';
import CursorPresence from './components/CursorPresence';
import LatencyMeter from './components/LatencyMeter';
import './App.css';

function App() {
  const { socket, connected, error } = useSocket('http://localhost:3001');
  const [sessionId, setSessionId] = useState(null);
  const [isJoined, setIsJoined] = useState(false);

  const sessionState = useSessionState(socket, sessionId);

  const handleSessionJoin = (sid) => {
    setSessionId(sid);
    setIsJoined(true);
  };

  const handleExit = () => {
    setIsJoined(false);
    setSessionId(null);
  };

  if (!isJoined) {
    return <SessionManager socket={socket} onSessionJoin={handleSessionJoin} />;
  }

  return (
    <div className="app">
      {!connected && (
        <div className="connection-banner disconnected">
          Disconnected - Reconnecting...
        </div>
      )}
      {error && (
        <div className="connection-banner error">
          Error: {error}
        </div>
      )}

      <div className="main-container">
        <Canvas 
          socket={socket} 
          sessionState={sessionState}
          currentUserId={socket?.id}
        />

        <UserList 
          users={sessionState.users}
          currentUserId={socket?.id}
        />

        <LatencyMeter socket={socket} />

        <CursorPresence
          socket={socket}
          cursors={sessionState.cursors}
          users={sessionState.users}
          currentUserId={socket?.id}
        />

        <button className="exit-button" onClick={handleExit}>
          Exit Session
        </button>

        <div className="session-info">
          Session: <code>{sessionId?.slice(0, 10)}...</code>
        </div>
      </div>
    </div>
  );
}

export default App;
