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
import LayersPanel from './components/LayersPanel';
import TemplateManager from './components/TemplateManager';
import SmartShapes from './components/SmartShapes';
import VideoEmbed from './components/VideoEmbed';
import AdvancedPermissions from './components/AdvancedPermissions';

import { useToast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';


const SOCKET_URL = 'http://localhost:3001';
const COLLAB_URL = 'ws://localhost:3001/collaboration';

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
  const [showLayers, setShowLayers] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSmartShapes, setShowSmartShapes] = useState(false);
  const [showVideoEmbed, setShowVideoEmbed] = useState(false);
  const [showAdvancedPermissions, setShowAdvancedPermissions] = useState(false);
  const [selectedSmartShape, setSelectedSmartShape] = useState(null);
  const [activeLayerId, setActiveLayerId] = useState(null);
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
    setShowLayers(false);
    setShowTemplates(false);
    setShowSmartShapes(false);
    setShowVideoEmbed(false);
    setShowAdvancedPermissions(false);
    setSelectedSmartShape(null);
    setActiveLayerId(null);
    setSelectedElement(null);
  };

  /** Templates are additive — loading one must not delete a collaborator's work. */
  const handleTemplateLoad = (canvasState) => {
    const added = doc.loadTemplate(canvasState);
    setShowTemplates(false);
    addToast(`Template loaded — ${added.elements} elements, ${added.layers} layers`, 'success');
  };

  const handleVideoEmbed = (videoData) => {
    if (!videoData) return;
    doc.addVideoEmbed({ ...videoData, x: 80, y: 80, layerId: activeLayerId || doc.defaultLayerId });
    setShowVideoEmbed(false);
  };

  const handlePermissionChange = (change) => {
    if (!isAdmin) return;
    if (change.action === 'role-changed') {
      session.changeRole(change.userId, change.newRole);
    } else if (change.permission) {
      socket?.emit('permission-change', change);
    }
  };

  const usersForPermissions = useMemo(
    () => (session.users || []).map((userId) => ({
      id: userId,
      name: userId.slice(0, 8),
      role: session.sessionMembers?.[userId]?.role || BASE_ROLES.VIEWER,
    })),
    [session.users, session.sessionMembers]
  );

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

          {showSmartShapes && canEdit && (
            <SmartShapes
              onShapeSelected={setSelectedSmartShape}
              selectedShape={selectedSmartShape?.type || null}
            />
          )}

          <Canvas
            sessionState={session}
            doc={doc}
            comments={doc.comments}
            currentUserId={clientId}
            userRole={userRole}
            activeLayerId={activeLayerId || doc.defaultLayerId}
            onToolChange={session.changeTool}
            selectedSmartShape={selectedSmartShape}
            onSmartShapeCleared={() => setSelectedSmartShape(null)}
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
              peerTools={session.peerTools}
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

            {showLayers && (
              <LayersPanel
                layers={doc.layers || []}
                layerOrder={(doc.layers || []).map((l) => l.id)}
                onLayerCreate={doc.createLayer}
                onLayerDelete={doc.deleteLayer}
                onLayerUpdate={doc.updateLayer}
                onLayerReorder={doc.reorderLayers}
                canEdit={canEdit}
              />
            )}

            {showAdvancedPermissions && isAdmin && permissionManager && (
              <AdvancedPermissions
                users={usersForPermissions}
                permissionManager={permissionManager}
                onPermissionChange={handlePermissionChange}
              />
            )}

            <button
              className="panel-toggle activity-toggle"
              onClick={() => setShowActivityLog(!showActivityLog)}
              aria-label="Toggle activity log panel"
              aria-expanded={showActivityLog}
              title="View session activity"
            >
              :: Activity
            </button>

            {selectedElement && (
              <button
                className="panel-toggle"
                onClick={() => setShowComments(!showComments)}
                aria-label="Toggle comments panel for the selected element"
                aria-expanded={showComments}
                title="View/add comments"
              >
                :: Comments
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
                :: Roles
              </button>
            )}

            {canEdit && (
              <button
                className={`panel-toggle ${showLayers ? 'active-panel' : ''}`}
                onClick={() => setShowLayers(!showLayers)}
                aria-label="Toggle layers panel"
                aria-expanded={showLayers}
                title="Manage drawing layers"
              >
                :: Layers
              </button>
            )}

            {canEdit && (
              <button
                className="panel-toggle"
                onClick={() => setShowTemplates(true)}
                aria-label="Open template manager"
                title="Load a pre-made whiteboard template"
              >
                :: Templates
              </button>
            )}

            {canEdit && (
              <button
                className={`panel-toggle ${showSmartShapes ? 'active-panel' : ''}`}
                onClick={() => {
                  setShowSmartShapes(!showSmartShapes);
                  if (showSmartShapes) setSelectedSmartShape(null);
                }}
                aria-label="Toggle smart shapes panel"
                aria-expanded={showSmartShapes}
                title="Smart shapes and flowchart elements"
              >
                :: Shapes
              </button>
            )}

            {canEdit && (
              <button
                className="panel-toggle"
                onClick={() => setShowVideoEmbed(true)}
                aria-label="Open video embed dialog"
                title="Embed a video on the canvas"
              >
                :: Video
              </button>
            )}

            {isAdmin && (
              <button
                className={`panel-toggle ${showAdvancedPermissions ? 'active-panel' : ''}`}
                onClick={() => setShowAdvancedPermissions(!showAdvancedPermissions)}
                aria-label="Toggle advanced permissions panel"
                aria-expanded={showAdvancedPermissions}
                title="Manage granular permissions"
              >
                :: Permissions
              </button>
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
                data-doc-elements={(doc.elements || []).length}
                data-doc-layers={(doc.layers || []).length}
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

      <TemplateManager
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onLoadTemplate={handleTemplateLoad}
      />

      <VideoEmbed
        isOpen={showVideoEmbed}
        onClose={() => setShowVideoEmbed(false)}
        onVideoEmbed={handleVideoEmbed}
      />

      <ToastContainer />
    </div>
  );
}
