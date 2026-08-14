/**
 * App.jsx - Root application component (v4)
 *
 * Orchestrates the collaborative whiteboard session, integrating:
 * - Sprint 1-18 + v3 features (existing)
 * - v4 Feature 1: Template System
 * - v4 Feature 2: Smart Shapes
 * - v4 Feature 3: Shape recognition (delegated to Canvas)
 * - v4 Feature 4: Video Embedding
 * - v4 Feature 5: Advanced Permissions
 */

import { useState, useEffect, useMemo } from 'react';
import { useSocket } from './hooks/useSocket';
import { useSessionState } from './hooks/useSessionState';
import { SessionPermissionManager, BASE_ROLES } from './utils/permissions';

// Existing components
import SessionManager from './components/SessionManager';
import Canvas from './components/Canvas';
import UserList from './components/UserList';
import LatencyMeter from './components/LatencyMeter';
import PresenceHalo from './components/PresenceHalo';
import CommentsPanel from './components/CommentsPanel';
import ActivityLog from './components/ActivityLog';
import RolesPanel from './components/RolesPanel';
import UndoRedoControls from './components/UndoRedoControls';
import LayersPanel from './components/LayersPanel';

// v4 Feature components
import TemplateManager from './components/TemplateManager';
import SmartShapes from './components/SmartShapes';
import VideoEmbed from './components/VideoEmbed';
import AdvancedPermissions from './components/AdvancedPermissions';

// Toast notifications
import { useToast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

import './App.css';

export default function App() {
  const { socket, connected, error, reconnectAttempt } = useSocket('http://localhost:3001');
  const [sessionId, setSessionId] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  /**
   * The server's session-create / session-join ack payload. This is the authoritative
   * initial state — the `user-joined` broadcast that carries the same data is emitted
   * before any listener can exist. See useSessionState rule 1.
   */
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  // Toast notifications
  const { addToast, ToastContainer } = useToast();

  // ── Panel visibility (existing) ──────────────────────────────────────────
  const [showComments, setShowComments] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [selectedStroke, setSelectedStroke] = useState(null);

  // ── v4 Feature 1: Template System ────────────────────────────────────────
  /** Controls visibility of the TemplateManager dialog */
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // ── v4 Feature 2: Smart Shapes ───────────────────────────────────────────
  /** Controls visibility of the SmartShapes sidebar panel */
  const [showSmartShapes, setShowSmartShapes] = useState(false);
  /**
   * The currently selected smart shape config { type, connectorStyle }.
   * Passed down to Canvas so click-to-place works.
   */
  const [selectedSmartShape, setSelectedSmartShape] = useState(null);

  // ── v4 Feature 4: Video Embedding ────────────────────────────────────────
  /** Controls visibility of the VideoEmbed dialog */
  const [showVideoEmbed, setShowVideoEmbed] = useState(false);

  // ── v4 Feature 5: Advanced Permissions ───────────────────────────────────
  /** Controls visibility of the AdvancedPermissions panel */
  const [showAdvancedPermissions, setShowAdvancedPermissions] = useState(false);
  /**
   * SessionPermissionManager instance — initialised once when session is
   * joined and updated as users join / roles change.
   */
  const [permissionManager, setPermissionManager] = useState(null);

  const sessionState = useSessionState(socket, sessionId, initialSnapshot);

  // ── Toast notifications for session events ────────────────────────────────
  useEffect(() => {
    if (!socket || !isJoined) return;

    // User joined session
    const handleUserJoined = (data) => {
      const userName = data.name || data.userId?.slice(0, 8);
      addToast(`${userName} joined the session`, 'info');
    };

    // User left session
    const handleUserLeft = (data) => {
      const userName = data.name || data.userId?.slice(0, 8);
      addToast(`${userName} left the session`, 'info');
    };

    // Role changed
    const handleRoleChanged = (data) => {
      const userName = data.name || data.userId?.slice(0, 8);
      addToast(`${userName}'s role changed to ${data.newRole}`, 'info');
    };

    // Template loaded
    const handleTemplateLoaded = () => {
      addToast('Template loaded successfully', 'success');
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('role-changed', handleRoleChanged);
    socket.on('template-loaded', handleTemplateLoaded);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('role-changed', handleRoleChanged);
      socket.off('template-loaded', handleTemplateLoaded);
    };
  }, [socket, isJoined, addToast]);

  // ── Connection state toasts ───────────────────────────────────────────────
  useEffect(() => {
    if (connected && isJoined) {
      addToast('Connected to server', 'success');
    }
  }, [connected, isJoined, addToast]);

  // ── Sprint 10-11: Undo/Redo keyboard shortcuts ───────────────────────────
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

  // ── v4 Feature 5: Initialise / update permission manager ────────────────
  useEffect(() => {
    if (!isJoined) return;

    const mgr = new SessionPermissionManager();
    const members = sessionState.sessionMembers || {};
    const users = sessionState.users || [];

    // `users` is an array of socket-id STRINGS (server.js sends Array.from(session.users)).
    // This previously read `user.id` on a string, which is always undefined — so every user
    // was registered under key `undefined` with the fallback VIEWER role.
    users.forEach(userId => {
      const role = members[userId]?.role || BASE_ROLES.VIEWER;
      mgr.registerUser(userId, role);
    });

    setPermissionManager(mgr);
  }, [isJoined, sessionState.users, sessionState.sessionMembers]);

  // ── Role helpers ─────────────────────────────────────────────────────────
  const userRole = sessionState.sessionMembers?.[socket?.id]?.role || 'viewer';
  const isAdmin = userRole === 'creator';
  const canEdit = userRole !== 'viewer';

  // ── Session handlers ─────────────────────────────────────────────────────
  const handleSessionJoin = (sid, snapshot) => {
    // Seed state before flipping isJoined, so the board renders with the correct role
    // and user list on its very first paint rather than after a broadcast that never comes.
    setInitialSnapshot(snapshot || null);
    setSessionId(sid);
    setIsJoined(true);
  };

  const handleExit = () => {
    setIsJoined(false);
    setSessionId(null);
    setInitialSnapshot(null);
    setPermissionManager(null);
    setShowTemplateManager(false);
    setShowSmartShapes(false);
    setShowVideoEmbed(false);
    setShowAdvancedPermissions(false);
    setSelectedSmartShape(null);
  };

  // ── v4 Feature 1: Template load handler ──────────────────────────────────

  /**
   * Load a template into the canvas.
   * Emits 'template-load' to the server so all collaborators receive it.
   * The server should broadcast 'template-loaded' back to the session.
   *
   * @param {Object} canvasState - { shapes, strokes, layers, connectors, ... }
   */
  const handleTemplateLoad = (canvasState) => {
    if (!canvasState) return;
    socket?.emit('template-load', canvasState);
    // Optimistic local update via the session state setter
    sessionState.setShapesLocal?.(canvasState.shapes || []);
    setShowTemplateManager(false);
  };

  // ── v4 Feature 2: Smart shape handlers ───────────────────────────────────

  /**
   * Receive shape selection from SmartShapes panel.
   * Stores it so Canvas knows what to place on next click.
   *
   * @param {{ type: string, connectorStyle: string }} shapeConfig
   */
  const handleSmartShapeSelected = (shapeConfig) => {
    setSelectedSmartShape(shapeConfig);
  };

  /**
   * Called by Canvas after successfully placing a smart shape.
   * Resets the selection so the user is back to normal drawing mode.
   */
  const handleSmartShapeCleared = () => {
    setSelectedSmartShape(null);
  };

  // ── v4 Feature 4: Video embed handler ────────────────────────────────────

  /**
   * Embed a new video on the canvas.
   * Creates the embed object, updates local state, and broadcasts via socket.
   *
   * @param {Object} videoData - { type, id?, data?, name?, width, height }
   */
  const handleVideoEmbed = (videoData) => {
    if (!videoData) return;

    const embed = {
      id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...videoData,
      // Default placement: top-left of visible canvas area
      x: 80,
      y: 80,
    };

    // Optimistic local update
    sessionState.setVideoEmbedsLocal?.(prev => [...(prev || []), embed]);
    // Broadcast to collaborators
    socket?.emit('video-embed', embed);
    setShowVideoEmbed(false);
  };

  // ── v4 Feature 5: Permission change handler ───────────────────────────────

  /**
   * Handle a permission change from the AdvancedPermissions panel.
   * Broadcasts the change to collaborators when the current user is admin.
   *
   * @param {{ userId: string, action: string, newRole?: string, permission?: string, granted?: boolean }} change
   */
  const handlePermissionChange = (change) => {
    if (!isAdmin) return;

    if (change.action === 'role-changed') {
      socket?.emit('role-change', { userId: change.userId, newRole: change.newRole });
    }
    // Individual permission overrides are local-only (no server support required)
  };

  // ── User list for AdvancedPermissions ────────────────────────────────────
  /** Map session users to the shape expected by AdvancedPermissions */
  // As above: entries are socket-id strings, not objects.
  const usersForPermissions = useMemo(() => (
    (sessionState.users || []).map(userId => ({
      id: userId,
      name: userId.slice(0, 8),
      role: sessionState.sessionMembers?.[userId]?.role || BASE_ROLES.VIEWER,
    }))
  ), [sessionState.users, sessionState.sessionMembers]);

  // ── Pre-join screen ───────────────────────────────────────────────────────
  if (!isJoined) {
    return <SessionManager socket={socket} onSessionJoin={handleSessionJoin} />;
  }

  return (
    <div className="app">
      {/* Skip to main content link for accessibility */}
      <a href="#main-canvas" className="skip-link">
        Skip to main content
      </a>

      {/* ARIA live region for real-time announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="announcements">
        {/* Screen reader announcements will be injected here */}
      </div>

      {/* Connection status banners */}
      {!connected && (
        <div className="connection-banner disconnected" role="alert">
          Disconnected — Reconnecting{reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : '…'}
        </div>
      )}
      {error && (
        <div className="connection-banner error" role="alert">
          Error: {error}
        </div>
      )}

      <ErrorBoundary>
        <div className="main-container" role="main" id="main-canvas">

        {/* ── v4 Feature 2: Smart Shapes sidebar ─────────────────────────── */}
        {showSmartShapes && canEdit && (
          <SmartShapes
            onShapeSelected={handleSmartShapeSelected}
            selectedShape={selectedSmartShape?.type || null}
          />
        )}

        {/* ── Core canvas ────────────────────────────────────────────────── */}
        <Canvas
          socket={socket}
          sessionState={sessionState}
          currentUserId={socket?.id}
          userRole={userRole}
          selectedSmartShape={selectedSmartShape}
          onSmartShapeCleared={handleSmartShapeCleared}
        />

        {/* Camera info HUD */}
        <div className="camera-info">
          Zoom: {(sessionState.camera?.zoom || 1).toFixed(2)}x |{' '}
          Pan: ({Math.round(sessionState.camera?.x || 0)}, {Math.round(sessionState.camera?.y || 0)})
        </div>

        {/* Exit button */}
        <button className="exit-button" onClick={handleExit} aria-label="Exit current session">
          Exit Session
        </button>

        {/* ── RIGHT SIDEBAR ──────────────────────────────────────────────── */}
        <div className="sidebar-column" role="complementary" aria-label="Session controls and information">

          {/* User list */}
          <UserList
            users={sessionState.users}
            sessionMembers={sessionState.sessionMembers}
            currentUserId={socket?.id}
            userRole={userRole}
          />

          {/* Activity log */}
          {showActivityLog && (
            <ActivityLog
              activityLog={sessionState.activityLog || []}
              users={sessionState.users}
            />
          )}

          {/* Comments panel (only when a stroke is selected) */}
          {showComments && selectedStroke && (
            <CommentsPanel
              socket={socket}
              strokeId={selectedStroke}
              comments={sessionState.comments?.filter(c => c.strokeId === selectedStroke) || []}
              currentUserId={socket?.id}
            />
          )}

          {/* Roles panel (admin-only) */}
          {showRoles && isAdmin && (
            <RolesPanel
              socket={socket}
              users={sessionState.users}
              sessionMembers={sessionState.sessionMembers}
            />
          )}

          {/* Layers panel */}
          {showLayers && (
            <LayersPanel
              layers={sessionState.layers || []}
              layerOrder={sessionState.layerOrder || []}
              onLayerCreate={sessionState.createLayer}
              onLayerDelete={sessionState.deleteLayer}
              onLayerUpdate={sessionState.updateLayer}
              onLayerReorder={sessionState.reorderLayers}
              canEdit={canEdit}
            />
          )}

          {/* ── v4 Feature 5: Advanced Permissions panel ─────────────────── */}
          {showAdvancedPermissions && isAdmin && permissionManager && (
            <AdvancedPermissions
              users={usersForPermissions}
              permissionManager={permissionManager}
              onPermissionChange={handlePermissionChange}
            />
          )}

          {/* ── Sidebar toggle buttons ──────────────────────────────────── */}

          <button
            className="panel-toggle activity-toggle"
            onClick={() => setShowActivityLog(!showActivityLog)}
            aria-label="Toggle activity log panel"
            aria-expanded={showActivityLog}
            title="View session activity"
          >
            📋 Activity
          </button>

          {selectedStroke && (
            <button
              className="panel-toggle"
              onClick={() => setShowComments(!showComments)}
              aria-label="Toggle comments panel for selected stroke"
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

          {canEdit && (
            <button
              className="panel-toggle"
              onClick={() => setShowLayers(!showLayers)}
              aria-label="Toggle layers management panel"
              aria-expanded={showLayers}
              title="Manage drawing layers"
            >
              📚 Layers
            </button>
          )}

          {/* ── v4 Feature 1: Templates button ─────────────────────────── */}
          {canEdit && (
            <button
              className="panel-toggle v4-feature-btn"
              onClick={() => setShowTemplateManager(true)}
              aria-label="Open template manager dialog"
              title="Load a pre-made whiteboard template"
            >
              🗂️ Templates
            </button>
          )}

          {/* ── v4 Feature 2: Smart Shapes toggle ──────────────────────── */}
          {canEdit && (
            <button
              className={`panel-toggle v4-feature-btn ${showSmartShapes ? 'active-panel' : ''}`}
              onClick={() => {
                setShowSmartShapes(!showSmartShapes);
                if (showSmartShapes) setSelectedSmartShape(null);
              }}
              aria-label="Toggle smart shapes panel"
              aria-expanded={showSmartShapes}
              title="Smart shapes & flowchart elements"
            >
              🔷 Shapes
            </button>
          )}

          {/* ── v4 Feature 4: Video Embed button ───────────────────────── */}
          {canEdit && (
            <button
              className="panel-toggle v4-feature-btn"
              onClick={() => setShowVideoEmbed(true)}
              aria-label="Open video embed dialog"
              title="Embed a video on the canvas"
            >
              🎬 Video
            </button>
          )}

          {/* ── v4 Feature 5: Advanced Permissions button (admin only) ──── */}
          {isAdmin && (
            <button
              className={`panel-toggle v4-feature-btn ${showAdvancedPermissions ? 'active-panel' : ''}`}
              onClick={() => setShowAdvancedPermissions(!showAdvancedPermissions)}
              aria-label="Toggle advanced permissions panel"
              aria-expanded={showAdvancedPermissions}
              title="Manage granular permissions"
            >
              🔐 Permissions
            </button>
          )}

          {/* Session info.
              The id used to render as `sessionId.slice(0, 10)…` — truncated in the only
              place it is ever shown, which meant a user could not read their own session id
              to share it, and therefore nobody could join. It is now shown in full and is
              selectable/copyable. */}
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
            <div>
              Role: <span className="role-badge">{userRole}</span>
            </div>
          </div>
        </div>

        {/* Presence halo */}
        {sessionState.userPresence && (
          <PresenceHalo
            userPresence={sessionState.userPresence}
            users={sessionState.users}
          />
        )}

        {/* Undo/Redo controls */}
        {canEdit && (
          <UndoRedoControls
            socket={socket}
            historyIndex={sessionState.historyIndex}
            historyLength={sessionState.history?.length || 0}
          />
        )}

        {/* Latency meter */}
        <LatencyMeter socket={socket} />

        {/* Remote cursors are rendered inside Canvas — they need the canvas rect and the
            local camera to place a canvas-space point correctly. */}
        </div>
      </ErrorBoundary>

      {/* ── Modals / dialogs (outside main-container to avoid clipping) ──── */}

      {/* v4 Feature 1: Template Manager dialog */}
      <TemplateManager
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        onLoadTemplate={handleTemplateLoad}
      />

      {/* v4 Feature 4: Video Embed dialog */}
      <VideoEmbed
        isOpen={showVideoEmbed}
        onClose={() => setShowVideoEmbed(false)}
        onVideoEmbed={handleVideoEmbed}
      />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
