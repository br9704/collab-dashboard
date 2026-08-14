/**
 * useSessionState - Core session state management hook
 *
 * Manages all collaborative session state including:
 * - Users, cursors, strokes, shapes, text boxes
 * - Undo/Redo history (Sprint 10-11)
 * - Camera synchronisation (Sprint 13-14)
 * - Presence awareness (Sprint 16)
 * - Comments (Sprint 17)
 * - Activity log (Sprint 18)
 * - v3: Text formatting, advanced layers, export
 * - v4: Templates, smart shapes, video embeds, shape recognition, permissions
 *
 * TWO CORRECTNESS RULES LIVE HERE — both were violated, and both caused blockers:
 *
 * 1. INITIAL STATE COMES FROM THE ACK, NOT FROM A BROADCAST.
 *    The server emits `user-joined` to the room *before* invoking the session-create /
 *    session-join ack. This effect cannot register until `sessionId` exists, and `sessionId`
 *    only exists once that ack fires — so the broadcast always arrived with no listener
 *    attached. The creator therefore never learned their own role (falling back to 'viewer')
 *    and never learned the user list (rendering ONLINE (0)). Seeding from `initialSnapshot`
 *    removes the race by construction: there is no ordering left to get wrong.
 *
 * 2. NEVER CALL socket.off(event) WITHOUT THE HANDLER.
 *    Bare `socket.off('cursor-update')` removes EVERY listener for that event across the
 *    whole app, including other components'. Every listener below is a named function and is
 *    removed with `socket.off(event, handler)`.
 */

import { useEffect, useState } from 'react';

const EMPTY_CAMERA = { x: 0, y: 0, zoom: 1 };

export function useSessionState(socket, sessionId, initialSnapshot) {
  const [users, setUsers] = useState([]);
  const [sessionMembers, setSessionMembers] = useState({});
  const [cursors, setCursors] = useState({});
  const [strokes, setStrokes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [textBoxes, setTextBoxes] = useState([]);
  const [mode, setMode] = useState('pencil');
  const [sessionData, setSessionData] = useState(null);

  // Sprint 10-11: Undo/Redo history
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Sprint 13-14: Camera state (zoom/pan)
  const [camera, setCamera] = useState({ ...EMPTY_CAMERA, timestamp: 0 });

  // Sprint 16: Presence awareness
  const [userPresence, setUserPresence] = useState({});

  // Sprint 17: Comments
  const [comments, setComments] = useState([]);

  // Sprint 18: Activity log
  const [activityLog, setActivityLog] = useState([]);

  // v3 Feature 1: Text Formatting
  const [textFormatting, setTextFormatting] = useState({});

  // v3 Feature 2: Advanced Layers
  const [layers, setLayers] = useState([]);
  const [layerOrder, setLayerOrder] = useState([]);

  // v3 Feature 3: Export (state only)
  const [exportInProgress, setExportInProgress] = useState(false);

  // ─── v4 Feature 1: Templates ─────────────────────────────────────────────
  const [lastLoadedTemplate, setLastLoadedTemplate] = useState(null);

  // ─── v4 Feature 4: Video Embeds ──────────────────────────────────────────
  /**
   * Array of embedded video objects:
   * { id, type, url|data, x, y, width, height, ... }
   */
  const [videoEmbeds, setVideoEmbeds] = useState([]);

  // ─── v4 Feature 5: Permissions ───────────────────────────────────────────
  const [permissionSnapshot, setPermissionSnapshot] = useState(null);

  /**
   * Apply a full server-shaped session snapshot to local state.
   * Used for the join ack (rule 1 above) and for any later full resync.
   */
  const applySnapshot = (s) => {
    if (!s) return;
    setUsers(s.users || []);
    setSessionMembers(s.sessionMembers || {});
    setStrokes(s.strokes || []);
    setShapes(s.shapes || []);
    setTextBoxes(s.textBoxes || []);
    setCursors(s.cursors || {});
    setMode(s.mode || 'pencil');
    setHistory(s.history || []);
    setHistoryIndex(s.historyIndex ?? -1);
    setCamera(s.camera || { ...EMPTY_CAMERA, timestamp: 0 });
    setUserPresence(s.userPresence || {});
    setComments(s.comments || []);
    setActivityLog(s.activityLog || []);
    setVideoEmbeds(s.videoEmbeds || []);
    setSessionData(s);
  };

  // ── RULE 1: seed from the ack, before any broadcast can matter ───────────
  useEffect(() => {
    applySnapshot(initialSnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSnapshot]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    // ── Join / sync ──────────────────────────────────────────────────────
    const onUserJoined = (data) => {
      if (!data) return;
      setUsers(data.users || []);
      // A join broadcast carries the full session state; apply it so late joiners and
      // already-present clients converge on the same board.
      applySnapshot(data.sessionState);
    };

    const onUserLeft = (data) => {
      if (!data) return;
      setUsers(data.users || []);
      if (!data.userId) return;
      const drop = (prev) => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      };
      setSessionMembers(drop);
      setCursors(drop);
      setUserPresence(drop);
    };

    // ── Cursors ──────────────────────────────────────────────────────────
    const onCursorUpdate = (data) => {
      if (!data || !data.userId) return;
      setCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, timestamp: data.timestamp }
      }));
    };

    // ── Drawing ──────────────────────────────────────────────────────────
    const onStrokeCreated = (stroke) => {
      if (!stroke) return;
      setStrokes(prev => [...prev, stroke]);
    };

    const onShapeCreated = (shape) => {
      if (!shape) return;
      setShapes(prev => [...prev, shape]);
    };

    // ── Text ─────────────────────────────────────────────────────────────
    const onTextCreated = (textBox) => {
      if (!textBox) return;
      setTextBoxes(prev => [...prev, textBox]);
    };

    const onTextUpdated = (textBox) => {
      if (!textBox || !textBox.id) return;
      setTextBoxes(prev => prev.map(t => (t.id === textBox.id ? textBox : t)));
    };

    const onTextDeleted = (id) => {
      if (!id) return;
      setTextBoxes(prev => prev.filter(t => t.id !== id));
    };

    // ── Undo/Redo ────────────────────────────────────────────────────────
    // The server now sends the rebuilt element set. Applying only `operationIndex`
    // (the old behaviour) meant Ctrl+Z moved a number and no ink ever disappeared.
    const applyHistoryResult = (data) => {
      if (!data || data.operationIndex === undefined) return;
      setHistoryIndex(data.operationIndex);
      if (data.elements) {
        setStrokes(data.elements.strokes || []);
        setShapes(data.elements.shapes || []);
        setTextBoxes(data.elements.textBoxes || []);
      }
    };
    const onUndoApplied = applyHistoryResult;
    const onRedoApplied = applyHistoryResult;

    // ── Camera ───────────────────────────────────────────────────────────
    const onCameraUpdated = (newCamera) => {
      if (!newCamera) return;
      setCamera(newCamera);
    };

    // ── Comments ─────────────────────────────────────────────────────────
    const onCommentCreated = (comment) => {
      if (!comment) return;
      setComments(prev => [...prev, comment]);
    };

    const onCommentResolved = (commentId) => {
      if (!commentId) return;
      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, resolved: true } : c))
      );
    };

    // ── Roles ────────────────────────────────────────────────────────────
    const onRoleUpdated = (data) => {
      if (!data || !data.userId || !data.newRole) return;
      setSessionMembers(prev => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], role: data.newRole }
      }));
    };

    const onToolChanged = (data) => {
      if (!data || !data.mode) return;
      setMode(data.mode);
    };

    // ── v3: Text formatting ───────────────────────────────────────────────
    const onTextFormattingUpdated = (data) => {
      if (!data || !data.textId) return;
      setTextFormatting(prev => ({ ...prev, [data.textId]: data.formatting }));
    };

    // ── v3: Layers ────────────────────────────────────────────────────────
    const onLayerCreated = (layer) => {
      if (!layer) return;
      setLayers(prev => [...prev, layer]);
      setLayerOrder(prev => [...prev, layer.id]);
    };

    const onLayerUpdated = (layer) => {
      if (!layer) return;
      setLayers(prev => prev.map(l => (l.id === layer.id ? layer : l)));
    };

    const onLayerDeleted = (layerId) => {
      if (!layerId) return;
      setLayers(prev => prev.filter(l => l.id !== layerId));
      setLayerOrder(prev => prev.filter(id => id !== layerId));
    };

    const onLayerOrderChanged = (newOrder) => {
      if (!newOrder) return;
      setLayerOrder(newOrder);
    };

    const onInitialLayers = (layersData) => {
      if (!layersData) return;
      setLayers(layersData.layers || []);
      setLayerOrder(layersData.layerOrder || []);
    };

    // ── v4 Feature 1: Template loaded ─────────────────────────────────────
    const onTemplateLoaded = (data) => {
      if (!data) return;
      setShapes(data.shapes || []);
      setStrokes(data.strokes || []);
      setTextBoxes(data.texts || []);
      if (data.layers && data.layers.length > 0) {
        setLayers(data.layers);
        setLayerOrder(data.layers.map(l => l.id));
      }
      setLastLoadedTemplate(data.templateMeta || null);
    };

    // ── v4 Feature 4: Video embeds ────────────────────────────────────────
    const onVideoEmbedCreated = (embed) => {
      if (!embed) return;
      setVideoEmbeds(prev => [...prev, embed]);
    };

    const onVideoEmbedMoved = (data) => {
      if (!data) return;
      setVideoEmbeds(prev =>
        prev.map(v => (v.id === data.id ? { ...v, x: data.x, y: data.y } : v))
      );
    };

    const onVideoEmbedRemoved = (embedId) => {
      if (!embedId) return;
      setVideoEmbeds(prev => prev.filter(v => v.id !== embedId));
    };

    // ── v4 Feature 5: Permissions snapshot ───────────────────────────────
    const onPermissionsSnapshot = (snapshot) => setPermissionSnapshot(snapshot);

    // ── v4 Feature 2: Smart shapes ────────────────────────────────────────
    const onSmartShapePlaced = (shape) => {
      if (!shape) return;
      setShapes(prev => [...prev, shape]);
    };

    // ── v4 Feature 3: Shape recognition ──────────────────────────────────
    const onShapeRecognitionAccepted = (shape) => {
      if (!shape) return;
      setShapes(prev => [...prev, shape]);
    };

    /**
     * RULE 2: every entry is [event, namedHandler] so teardown can pass the handler.
     * Never collapse this to socket.off(event) — that would also unhook other components.
     */
    const listeners = [
      ['user-joined', onUserJoined],
      ['user-left', onUserLeft],
      ['cursor-update', onCursorUpdate],
      ['stroke-created', onStrokeCreated],
      ['shape-created', onShapeCreated],
      ['text-created', onTextCreated],
      ['text-updated', onTextUpdated],
      ['text-deleted', onTextDeleted],
      ['undo-applied', onUndoApplied],
      ['redo-applied', onRedoApplied],
      ['camera-updated', onCameraUpdated],
      ['comment-created', onCommentCreated],
      ['comment-resolved', onCommentResolved],
      ['role-updated', onRoleUpdated],
      ['tool-changed', onToolChanged],
      ['text-formatting-updated', onTextFormattingUpdated],
      ['layer-created', onLayerCreated],
      ['layer-updated', onLayerUpdated],
      ['layer-deleted', onLayerDeleted],
      ['layer-order-changed', onLayerOrderChanged],
      ['initial-layers', onInitialLayers],
      ['template-loaded', onTemplateLoaded],
      ['video-embed-created', onVideoEmbedCreated],
      ['video-embed-moved', onVideoEmbedMoved],
      ['video-embed-removed', onVideoEmbedRemoved],
      ['permissions-snapshot', onPermissionsSnapshot],
      ['smart-shape-placed', onSmartShapePlaced],
      ['shape-recognition-accepted', onShapeRecognitionAccepted],
    ];

    listeners.forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      listeners.forEach(([event, handler]) => socket.off(event, handler));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, sessionId]);

  return {
    users,
    sessionMembers,
    cursors,
    strokes,
    shapes,
    textBoxes,
    mode,
    sessionData,
    history,
    historyIndex,
    camera,
    userPresence,
    comments,
    activityLog,
    textFormatting,
    layers,
    layerOrder,
    exportInProgress,
    // v4 state
    videoEmbeds,
    lastLoadedTemplate,
    permissionSnapshot,

    // ── Emitters ──────────────────────────────────────────────────────────
    moveCursor: (x, y) => socket?.emit('cursor-move', { x, y }),
    drawStroke: (points, color, width) => socket?.emit('stroke-draw', { points, color, width }),
    drawShape: (type, points, color, width) => socket?.emit('shape-draw', { type, points, color, width }),
    addText: (text, x, y, color) => socket?.emit('text-add', { text, x, y, color }),
    updateText: (id, text) => socket?.emit('text-update', { id, text }),
    deleteText: (id) => socket?.emit('text-delete', id),
    changeTool: (m) => socket?.emit('tool-change', { mode: m }),
    updateCamera: (x, y, zoom) => socket?.emit('camera-change', { x, y, zoom, timestamp: Date.now() }),
    updateTextFormatting: (textId, formatting) => socket?.emit('text-formatting-update', { textId, formatting }),
    createLayer: (layerName) => socket?.emit('layer-create', { name: layerName }),
    updateLayer: (layerId, updates) => socket?.emit('layer-update', { layerId, updates }),
    deleteLayer: (layerId) => socket?.emit('layer-delete', { layerId }),
    reorderLayers: (newOrder) => socket?.emit('layer-order-change', { newOrder }),

    // v4 emitters
    loadTemplate: (canvasState) => socket?.emit('template-load', canvasState),
    embedVideo: (embed) => socket?.emit('video-embed', embed),
    moveVideoEmbed: (id, x, y) => socket?.emit('video-embed-move', { id, x, y }),
    removeVideoEmbed: (id) => socket?.emit('video-embed-remove', id),
    placeSmartShape: (shapeData) => socket?.emit('smart-shape-place', shapeData),
    acceptRecognizedShape: (shapeData) => socket?.emit('shape-recognition-accept', shapeData),
    broadcastPermission: (change) => socket?.emit('permission-change', change),

    // v4 local-only setters (for optimistic updates without server)
    setVideoEmbedsLocal: setVideoEmbeds,
    setShapesLocal: setShapes,
  };
}
