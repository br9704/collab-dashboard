import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useSessionState } from './hooks/useSessionState';
import SessionManager from './components/SessionManager';
import Canvas from './components/Canvas';
import UserList from './components/UserList';
import CursorPresence from './components/CursorPresence';
import LatencyMeter from './components/LatencyMeter';
import PresenceHalo from './components/PresenceHalo';
import CommentsPanel from './components/CommentsPanel';
import ActivityLog from './components/ActivityLog';
import RolesPanel from './components/RolesPanel';
import UndoRedoControls from './components/UndoRedoControls';
import './App.css';

function App() {
  const { socket, connected, error } = useSocket('http://localhost:3001');
  const [sessionId, setSessionId] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [selectedStroke, setSelectedStroke] = useState(null);

  const sessionState = useSessionState(socket, sessionId);

  // Sprint 10-11: Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        socket?.emit('undo');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        socket?.emit('redo');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket]);

  const handleSessionJoin = (sid) => {
    setSessionId(sid);
    setIsJoined(true);
  };

  const handleExit = () => {
    setIsJoined(false);
    setSessionId(null);
  };

  const userRole = sessionState.sessionMembers?.[socket?.id]?.role || 'viewer';
  const isAdmin = userRole === 'admin';

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
        {/* Canvas with drawing */}
        <Canvas 
          socket={socket} 
          sessionState={sessionState}
          currentUserId={socket?.id}
          userRole={userRole}
        />

        {/* Sprint 13-14: Camera sync display */}
        <div className="camera-info">
          Zoom: {(sessionState.camera?.zoom || 1).toFixed(2)}x | 
          Pan: ({Math.round(sessionState.camera?.x || 0)}, {Math.round(sessionState.camera?.y || 0)})
        </div>

        {/* User presence with roles */}
        <UserList 
          users={sessionState.users}
          sessionMembers={sessionState.sessionMembers}
          currentUserId={socket?.id}
          userRole={userRole}
        />

        {/* Sprint 16: Presence awareness indicators */}
        {sessionState.userPresence && (
          <PresenceHalo 
            userPresence={sessionState.userPresence}
            users={sessionState.users}
          />
        )}

        {/* Sprint 10-11: Undo/Redo controls */}
        {userRole !== 'viewer' && (
          <UndoRedoControls 
            socket={socket}
            historyIndex={sessionState.historyIndex}
            historyLength={sessionState.history?.length || 0}
          />
        )}

        {/* Latency meter */}
        <LatencyMeter socket={socket} />

        {/* Remote cursors */}
        <CursorPresence
          socket={socket}
          cursors={sessionState.cursors}
          users={sessionState.users}
          currentUserId={socket?.id}
        />

        {/* Role management (admin only) */}
        {isAdmin && (
          <button 
            className="panel-toggle"
            onClick={() => setShowRoles(!showRoles)}
            title="Manage user roles"
          >
            👥 Roles
          </button>
        )}
        {showRoles && isAdmin && (
          <RolesPanel 
            socket={socket}
            users={sessionState.users}
            sessionMembers={sessionState.sessionMembers}
          />
        )}

        {/* Comments panel (Sprint 17) */}
        {selectedStroke && (
          <button 
            className="panel-toggle"
            onClick={() => setShowComments(!showComments)}
            title="View/add comments"
          >
            💬 Comments
          </button>
        )}
        {showComments && selectedStroke && (
          <CommentsPanel
            socket={socket}
            strokeId={selectedStroke}
            comments={sessionState.comments?.filter(c => c.strokeId === selectedStroke) || []}
            currentUserId={socket?.id}
          />
        )}

        {/* Activity log (Sprint 18) */}
        <button 
          className="panel-toggle activity-toggle"
          onClick={() => setShowActivityLog(!showActivityLog)}
          title="View session activity"
        >
          📋 Activity
        </button>
        {showActivityLog && (
          <ActivityLog 
            activityLog={sessionState.activityLog || []}
            users={sessionState.users}
          />
        )}

        {/* Exit button */}
        <button className="exit-button" onClick={handleExit}>
          Exit Session
        </button>

        {/* Session info */}
        <div className="session-info">
          Session: <code>{sessionId?.slice(0, 10)}...</code>
          <br />
          Role: <span className="role-badge">{userRole}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
