/**
 * App.jsx - Root application component
 *
 * Sprint 2 split the application into two planes:
 *
 *   useCollabDoc     the board — strokes, shapes, text, comments. A Yjs document served by
 *                    Hocuspocus, persisted to SQLite, cached offline in IndexedDB. Cursors
 *                    and camera ride the Awareness protocol and are never persisted.
 *
 *   useSessionState  the control plane — membership, roles, activity. Stays on socket.io
 *                    because roles must be server-authoritative: a client with document
 *                    write access could otherwise promote itself.
 */

import { useState, useEffect, useMemo } from 'react';
import { useSocket } from './hooks/useSocket';
import { useSessionState } from './hooks/useSessionState';
import { useCollabDoc } from './hooks/useCollabDoc';
import { SessionPermissionManager, BASE_ROLES } from './utils/permissions';
import { getClientId } from './collab/identity';

import SessionManager from './components/SessionManager';
import Canvas from './components/Canvas';
import UserList from './components/UserList';
import LatencyMeter from './components/LatencyMeter';
import CommentsPanel from './components/CommentsPanel';
import ActivityLog from './components/ActivityLog';
import RolesPanel from './components/RolesPanel';
import UndoRedoControls from './components/UndoRedoControls';

import { useToast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

import './App.css';

const SOCKET_URL = 'http://localhost:3001';
const COLLAB_URL = 'ws://localhost:3001/collaboration';

/**
 * Templates, Smart Shapes, Layers, Text Formatting, Video Embed and Advanced Permissions
 * emit socket events that no server handler has ever listened for — they have never done
 * anything. They are hidden until Sprint 3 wires them onto the document, rather than left
 * on screen as controls that silently do nothing.
 */
const SPRINT3_FEATURES_READY = false;

export default function App() {
  const { socket, connected, error, reconnectAttempt } = useSocket(SOCKET_URL);
  /**
   * Identity is the stable client id, NOT socket.id. Roles are persisted against it, so it
   * must survive a reload — otherwise a creator returns to their own board as a viewer.
   */
  const clientId = getClientId();
  const [sessionId, setSessionId] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [collabToken, setCollabToken] = useState(null);
  /**
   * The server's ack payload. This is the authoritative initial state — the broadcast
   * carrying the same data reaches the room before the ack returns, so a listener registered
   * afterwards can never see it. Discarding this is what made the creator a viewer.
   */
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  const { addToast, ToastContainer } = useToast();

  const [showComments, setShowComments] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);

  const session = useSessionState(socket, sessionId, initialSnapshot, clientId);
  const doc = useCollabDoc({
    url: COLLAB_URL,
    sessionId,
    token: collabToken,
    userId: clientId,
  });

  // ── Role helpers ─────────────────────────────────────────────────────────
  const userRole = session.sessionMembers?.[clientId]?.role || 'viewer';
  const isAdmin = userRole === 'creator';
  const canEdit = userRole !== 'viewer';

  // ── A role change alters the document connection's read-only flag, which is fixed for the
  //    life of that connection. Reopen it so the new permission applies immediately. ───────
  useEffect(() => {
    if (session.docReconnectSignal > 0) {
      doc.reconnect();
      addToast(
        userRole === 'viewer' ? 'You are now a viewer' : 'You can now edit',
        'info'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.docReconnectSignal]);

  // ── Undo/redo shortcuts. Per-user, via the document's UndoManager. ───────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        doc.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        doc.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [doc]);

  // ── Presence toasts ──────────────────────────────────────────────────────
  const liveCount = session.users?.length || 0;
  useEffect(() => {
    if (!isJoined) return;
    const last = session.activityLog?.[session.activityLog.length - 1];
    if (!last) return;
    if (last.action === 'user-joined' && last.userId !== clientId) {
      addToast(`${last.userId.slice(0, 8)} joined the session`, 'info');
    }
    if (last.action === 'user-left') {
      addToast(`${last.userId.slice(0, 8)} left the session`, 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.activityLog?.length]);

  // ── Permission manager (used by the Sprint 3 permissions UI) ─────────────
  const permissionManager = useMemo(() => {
    if (!isJoined) return null;
    const mgr = new SessionPermissionManager();
    // `users` is an array of client-id STRINGS, not objects.
    (session.users || []).forEach((userId) => {
      mgr.registerUser(userId, session.sessionMembers?.[userId]?.role || BASE_ROLES.VIEWER);
    });
    return mgr;
  }, [isJoined, session.users, session.sessionMembers]);

  // ── Session handlers ─────────────────────────────────────────────────────
  const handleSessionJoin = (sid, snapshot, token) => {
    setInitialSnapshot(snapshot || null);
    setCollabToken(token || null);
    setSessionId(sid);
    setIsJoined(true);
  };

  const handleExit = () => {
    setIsJoined(false);
    setSessionId(null);
    setCollabToken(null);
    setInitialSnapshot(null);
    setShowComments(false);
    setShowActivityLog(false);
    setShowRoles(false);
    setSelectedElement(null);
  };

  const commentsForSelected = useMemo(
    () => (doc.comments || []).filter((c) => c.elementId === selectedElement),
    [doc.comments, selectedElement]
  );

  if (!isJoined) {
    return <SessionManager socket={socket} onSessionJoin={handleSessionJoin} />;
  }

  return (
    <div className="app">
      <a href="#main-canvas" className="skip-link">Skip to main content</a>

      <div aria-live="polite" aria-atomic="true" className="sr-only" id="announcements" />

      {!connected && (
        <div className="connection-banner disconnected" role="alert">
          Disconnected — Reconnecting{reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : '…'}
        </div>
      )}
      {error && (
        <div className="connection-banner error" role="alert">Error: {error}</div>
      )}
      {doc.authError && (
        <div className="connection-banner error" role="alert">
          Document access denied: {doc.authError}
        </div>
      )}

      <ErrorBoundary>
        <div className="main-container" role="main" id="main-canvas">

          <Canvas
            sessionState={session}
            doc={doc}
            currentUserId={clientId}
            userRole={userRole}
            onSelectElement={setSelectedElement}
          />

          <button className="exit-button" onClick={handleExit} aria-label="Exit current session">
            Exit Session
          </button>

          <div className="sidebar-column" role="complementary" aria-label="Session controls and information">

            <UserList
              users={session.users}
              sessionMembers={session.sessionMembers}
              currentUserId={clientId}
              userRole={userRole}
            />

            {showActivityLog && (
              <ActivityLog activityLog={session.activityLog || []} users={session.users} />
            )}

            {showComments && selectedElement && (
              <CommentsPanel
                elementId={selectedElement}
                comments={commentsForSelected}
                currentUserId={clientId}
                onAddComment={doc.addComment}
                onResolveComment={doc.resolveComment}
              />
            )}

            {showRoles && isAdmin && (
              <RolesPanel
                socket={socket}
                users={session.users}
                sessionMembers={session.sessionMembers}
              />
            )}

            <button
              className="panel-toggle activity-toggle"
              onClick={() => setShowActivityLog(!showActivityLog)}
              aria-label="Toggle activity log panel"
              aria-expanded={showActivityLog}
              title="View session activity"
            >
              📋 Activity
            </button>

            {selectedElement && (
              <button
                className="panel-toggle"
                onClick={() => setShowComments(!showComments)}
                aria-label="Toggle comments panel for the selected element"
                aria-expanded={showComments}
                title="View/add comments"
              >
                💬 Comments
              </button>
            )}

            {isAdmin && (
              <button
                className="panel-toggle"
                onClick={() => setShowRoles(!showRoles)}
                aria-label="Toggle roles management panel"
                aria-expanded={showRoles}
                title="Manage user roles"
              >
                👥 Roles
              </button>
            )}

            {/* Sprint 3 wires Templates / Smart Shapes / Layers / Video / Permissions onto
                the document. Until then they are hidden rather than shown as dead controls. */}
            {SPRINT3_FEATURES_READY && canEdit && (
              <div className="sprint3-placeholder" />
            )}

            <div className="session-info">
              <label htmlFor="session-id-value">Session</label>
              <code id="session-id-value" data-session-id={sessionId || ''}>{sessionId}</code>
              <button
                type="button"
                className="copy-session-id"
                onClick={() => navigator.clipboard?.writeText(sessionId || '')}
                aria-label="Copy session ID to clipboard"
                title="Copy session ID"
              >
                copy
              </button>
              <div>Role: <span className="role-badge">{userRole}</span></div>
              <div
                className="doc-status"
                data-doc-status={doc.status}
                data-doc-synced={doc.synced ? 'yes' : 'no'}
                title="Document connection state"
              >
                Doc: {doc.status}{doc.synced ? ' · synced' : ''}
              </div>
            </div>
          </div>

          {canEdit && (
            <UndoRedoControls
              canUndo={doc.canUndo}
              canRedo={doc.canRedo}
              onUndo={doc.undo}
              onRedo={doc.redo}
            />
          )}

          <LatencyMeter socket={socket} />
        </div>
      </ErrorBoundary>

      <ToastContainer />
    </div>
  );
}
