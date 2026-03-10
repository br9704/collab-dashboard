/**
 * App.jsx - Root application component (v4)
 *
 * Orchestrates the collaborative whiteboard session, integrating:
 * - Sprint 1-18 + v3 features (existing)
 * - v4 Feature 1: Template System
 * - v4 Feature 2: Smart Shapes
 * - v4 Feature 3: AI Shape Completion (delegated to Canvas)
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
import CursorPresence from './components/CursorPresence';
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

import './App.css';

export default function App() {
  const { socket, connected, error } = useSocket('http://localhost:3001');
  const [sessionId, setSessionId] = useState(null);
  const [isJoined, setIsJoined] = useState(false);

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

  const sessionState = useSessionState(socket, sessionId);

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

    users.forEach(user => {
      const role = members[user.id]?.role || BASE_ROLES.VIEWER;
      mgr.registerUser(user.id, role);
    });

    setPermissionManager(mgr);
  }, [isJoined, sessionState.users, sessionState.sessionMembers]);

  // ── Role helpers ─────────────────────────────────────────────────────────
  const userRole = sessionState.sessionMembers?.[socket?.id]?.role || 'viewer';
  const isAdmin = userRole === 'admin';
  const canEdit = userRole !== 'viewer';

  // ── Session handlers ─────────────────────────────────────────────────────
  const handleSessionJoin = (sid) => {
    setSessionId(sid);
    setIsJoined(true);
  };

  const handleExit = () => {
    setIsJoined(false);
    setSessionId(null);
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
  const usersForPermissions = useMemo(() => (
    (sessionState.users || []).map(u => ({
      id: u.id,
      name: u.name || u.id?.slice(0, 8),
      role: sessionState.sessionMembers?.[u.id]?.role || BASE_ROLES.VIEWER,
    }))
  ), [sessionState.users, sessionState.sessionMembers]);

  // ── Pre-join screen ───────────────────────────────────────────────────────
  if (!isJoined) {
    return <SessionManager socket={socket} onSessionJoin={handleSessionJoin} />;
  }

  return (
    <div className="app">
      {/* Connection status banners */}
      {!connected && (
        <div className="connection-banner disconnected">
          Disconnected — Reconnecting…
        </div>
      )}
      {error && (
        <div className="connection-banner error">
          Error: {error}
        </div>
      )}

      <div className="main-container">

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
        <button className="exit-button" onClick={handleExit}>
          Exit Session
        </button>

        {/* ── RIGHT SIDEBAR ──────────────────────────────────────────────── */}
        <div className="sidebar-column">

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
            title="View session activity"
          >
            📋 Activity
          </button>

          {selectedStroke && (
            <button
              className="panel-toggle"
              onClick={() => setShowComments(!showComments)}
              title="View/add comments"
            >
              💬 Comments
            </button>
          )}

          {isAdmin && (
            <button
              className="panel-toggle"
              onClick={() => setShowRoles(!showRoles)}
              title="Manage user roles"
            >
              👥 Roles
            </button>
          )}

          {canEdit && (
            <button
              className="panel-toggle"
              onClick={() => setShowLayers(!showLayers)}
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
              title="Manage granular permissions"
            >
              🔐 Permissions
            </button>
          )}

          {/* Session info */}
          <div className="session-info">
            Session: <code>{sessionId?.slice(0, 10)}…</code>
            <br />
            Role: <span className="role-badge">{userRole}</span>
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

        {/* Remote cursors */}
        <CursorPresence
          socket={socket}
          cursors={sessionState.cursors}
          users={sessionState.users}
          currentUserId={socket?.id}
        />
      </div>

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
    </div>
  );
}
