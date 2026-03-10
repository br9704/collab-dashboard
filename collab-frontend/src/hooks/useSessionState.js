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
 * - v4: Templates, smart shapes, video embeds, AI completion, permissions
 */

import { useEffect, useState } from 'react';

export function useSessionState(socket, sessionId) {
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
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1, timestamp: Date.now() });

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
  // templateState holds the last loaded template metadata for audit purposes
  const [lastLoadedTemplate, setLastLoadedTemplate] = useState(null);

  // ─── v4 Feature 4: Video Embeds ──────────────────────────────────────────
  /**
   * Array of embedded video objects:
   * { id, type, url|data, x, y, width, height, ... }
   */
  const [videoEmbeds, setVideoEmbeds] = useState([]);

  // ─── v4 Feature 5: Permissions ───────────────────────────────────────────
  // Tracks the serialised permission snapshot from the server (informational)
  const [permissionSnapshot, setPermissionSnapshot] = useState(null);

  useEffect(() => {
    if (!socket || !sessionId) return;

    // ── Join / sync ──────────────────────────────────────────────────────
    socket.on('user-joined', (data) => {
      setUsers(data.users);
      if (data.sessionState) {
        const s = data.sessionState;
        setStrokes(s.strokes || []);
        setShapes(s.shapes || []);
        setTextBoxes(s.textBoxes || []);
        setCursors(s.cursors || {});
        setMode(s.mode || 'pencil');
        setSessionMembers(s.sessionMembers || {});
        setHistory(s.history || []);
        setHistoryIndex(s.historyIndex || -1);
        setCamera(s.camera || { x: 0, y: 0, zoom: 1, timestamp: Date.now() });
        setUserPresence(s.userPresence || {});
        setComments(s.comments || []);
        setActivityLog(s.activityLog || []);
        // v4: restore embedded videos if server persists them
        setVideoEmbeds(s.videoEmbeds || []);
        setSessionData(s);
      }
    });

    socket.on('user-left', (data) => {
      setUsers(data.users);
      setSessionMembers(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
      setCursors(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
      setUserPresence(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
    });

    // ── Cursors ──────────────────────────────────────────────────────────
    socket.on('cursor-update', (data) => {
      setCursors(prev => ({ ...prev, [data.userId]: { x: data.x, y: data.y } }));
    });

    // ── Drawing ──────────────────────────────────────────────────────────
    socket.on('stroke-created', (stroke) => {
      setStrokes(prev => [...prev, stroke]);
    });

    socket.on('shape-created', (shape) => {
      setShapes(prev => [...prev, shape]);
    });

    // ── Text ─────────────────────────────────────────────────────────────
    socket.on('text-created', (textBox) => {
      setTextBoxes(prev => [...prev, textBox]);
    });

    socket.on('text-updated', (textBox) => {
      setTextBoxes(prev => prev.map(t => (t.id === textBox.id ? textBox : t)));
    });

    socket.on('text-deleted', (id) => {
      setTextBoxes(prev => prev.filter(t => t.id !== id));
    });

    // ── Undo/Redo ────────────────────────────────────────────────────────
    socket.on('undo-applied', (data) => {
      setHistoryIndex(data.operationIndex);
    });

    socket.on('redo-applied', (data) => {
      setHistoryIndex(data.operationIndex);
    });

    // ── Camera ───────────────────────────────────────────────────────────
    socket.on('camera-updated', (newCamera) => {
      setCamera(newCamera);
    });

    // ── Comments ─────────────────────────────────────────────────────────
    socket.on('comment-created', (comment) => {
      setComments(prev => [...prev, comment]);
    });

    socket.on('comment-resolved', (commentId) => {
      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, resolved: true } : c))
      );
    });

    // ── Roles ────────────────────────────────────────────────────────────
    socket.on('role-updated', (data) => {
      setSessionMembers(prev => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], role: data.newRole }
      }));
    });

    socket.on('tool-changed', (data) => {
      setMode(data.mode);
    });

    // ── v3: Text formatting ───────────────────────────────────────────────
    socket.on('text-formatting-updated', (data) => {
      setTextFormatting(prev => ({ ...prev, [data.textId]: data.formatting }));
    });

    // ── v3: Layers ────────────────────────────────────────────────────────
    socket.on('layer-created', (layer) => {
      setLayers(prev => [...prev, layer]);
      setLayerOrder(prev => [...prev, layer.id]);
    });

    socket.on('layer-updated', (layer) => {
      setLayers(prev => prev.map(l => (l.id === layer.id ? layer : l)));
    });

    socket.on('layer-deleted', (layerId) => {
      setLayers(prev => prev.filter(l => l.id !== layerId));
      setLayerOrder(prev => prev.filter(id => id !== layerId));
    });

    socket.on('layer-order-changed', (newOrder) => {
      setLayerOrder(newOrder);
    });

    socket.on('initial-layers', (layersData) => {
      setLayers(layersData.layers);
      setLayerOrder(layersData.layerOrder);
    });

    // ── v4 Feature 1: Template loaded ─────────────────────────────────────
    socket.on('template-loaded', (data) => {
      if (!data) return;
      // Replace canvas content with template shapes
      setShapes(data.shapes || []);
      setStrokes(data.strokes || []);
      setTextBoxes(data.texts || []);
      if (data.layers && data.layers.length > 0) {
        setLayers(data.layers);
        setLayerOrder(data.layers.map(l => l.id));
      }
      setLastLoadedTemplate(data.templateMeta || null);
    });

    // ── v4 Feature 4: Video embeds ────────────────────────────────────────
    socket.on('video-embed-created', (embed) => {
      setVideoEmbeds(prev => [...prev, embed]);
    });

    socket.on('video-embed-moved', (data) => {
      setVideoEmbeds(prev =>
        prev.map(v => (v.id === data.id ? { ...v, x: data.x, y: data.y } : v))
      );
    });

    socket.on('video-embed-removed', (embedId) => {
      setVideoEmbeds(prev => prev.filter(v => v.id !== embedId));
    });

    // ── v4 Feature 5: Permissions snapshot ───────────────────────────────
    socket.on('permissions-snapshot', (snapshot) => {
      setPermissionSnapshot(snapshot);
    });

    // ── v4 Feature 2: Smart shapes ────────────────────────────────────────
    socket.on('smart-shape-placed', (shape) => {
      setShapes(prev => [...prev, shape]);
    });

    // ── v4 Feature 3: AI shape completion ────────────────────────────────
    socket.on('ai-shape-accepted', (shape) => {
      setShapes(prev => [...prev, shape]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('cursor-update');
      socket.off('stroke-created');
      socket.off('shape-created');
      socket.off('text-created');
      socket.off('text-updated');
      socket.off('text-deleted');
      socket.off('undo-applied');
      socket.off('redo-applied');
      socket.off('camera-updated');
      socket.off('comment-created');
      socket.off('comment-resolved');
      socket.off('role-updated');
      socket.off('tool-changed');
      socket.off('text-formatting-updated');
      socket.off('layer-created');
      socket.off('layer-updated');
      socket.off('layer-deleted');
      socket.off('layer-order-changed');
      socket.off('initial-layers');
      socket.off('template-loaded');
      socket.off('video-embed-created');
      socket.off('video-embed-moved');
      socket.off('video-embed-removed');
      socket.off('permissions-snapshot');
      socket.off('smart-shape-placed');
      socket.off('ai-shape-accepted');
    };
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
    acceptAIShape: (shapeData) => socket?.emit('ai-shape-accept', shapeData),
    broadcastPermission: (change) => socket?.emit('permission-change', change),

    // v4 local-only setters (for optimistic updates without server)
    setVideoEmbedsLocal: setVideoEmbeds,
    setShapesLocal: setShapes,
  };
}
