/**
 * Canvas - the drawing surface.
 *
 * Sprint 2 changed where drawing GOES, not how it feels. A finished stroke is written into
 * the Yjs document as a single immutable point array (see collab/doc.js rule 1); cursors and
 * "is drawing" go out over Awareness. Nothing on this surface emits socket events any more.
 *
 * LOCAL INK IS SACRED. The live preview draws straight to the 2D context on pointer-move
 * with no buffering, smoothing or round trip. The document write happens on pointer-up.
 * All latency budget is spent on making *remote* drawing smooth, never local.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import TextInputDialog from './TextInputDialog';
import CursorPresence from './CursorPresence';
import PresenceHalo from './PresenceHalo';
import ShapeRecognition from './ShapeRecognition';
import ExportDialog from './ExportDialog';
import VideoEmbedCanvas from './VideoEmbedCanvas';
import TextFormattingToolbar from './TextFormattingToolbar';
import { SHAPE_CONFIG } from '../utils/shapeUtils';
import { KIND } from '../collab/doc';

/**
 * @param {Object}   props
 * @param {Object}   props.sessionState    - control plane (members, roles)
 * @param {Object}   props.doc             - useCollabDoc: elements, peers, mutations
 * @param {string}   props.currentUserId
 * @param {string}   props.userRole        - 'creator' | 'editor' | 'viewer'
 * @param {Function} props.onSelectElement
 */
export default function Canvas({
  doc,
  comments,
  currentUserId,
  userRole,
  activeLayerId,
  onToolChange,
  selectedSmartShape,
  onSmartShapeCleared,
  onSelectElement,
}) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#f0ece4'); // warm white ink on warm black
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(2);

  // Camera is local-only. Synchronised camera is a Sprint 3 concern; it rides Awareness.
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textDialogPos, setTextDialogPos] = useState({ x: 0, y: 0 });

  const [lastCompletedStroke, setLastCompletedStroke] = useState(null);
  const [canvasRect, setCanvasRect] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [showExport, setShowExport] = useState(false);

  /**
   * Elements that just appeared or vanished, and when.
   *
   * MOTION.md: a remote undo must read as deliberate removal, not as data loss. The affected
   * element flashes to 50% and back over 240ms rather than blinking out of existence. Held in
   * a ref, not state, because the render loop reads it every frame.
   */
  const flashRef = useRef(new Map());   // elementId -> { at, element }
  const prevElementsRef = useRef(new Map());

  const currentStrokeRef = useRef(null);
  const shapeStartRef = useRef(null);
  const textInputPositionRef = useRef(null);

  const dirtyRef = useRef(true);
  const animationFrameRef = useRef(null);

  // Separate clocks: sharing one made panning starve cursor broadcasts.
  const lastCursorEmitRef = useRef(0);
  const CURSOR_THROTTLE_MS = 33; // ~30fps

  const canDraw = userRole !== 'viewer';

  /**
   * Selecting a tool is broadcast so collaborators can see what everyone is holding —
   * shown as a glyph beside each name in the user list. Ephemeral by nature, so it goes
   * over sockets rather than into the persisted document.
   */
  const selectTool = useCallback((next) => {
    setTool(next);
    onToolChange?.(next);
  }, [onToolChange]);

  const elements = doc?.elements || [];
  const peers = doc?.peers || [];
  const layers = doc?.layers || [];

  /**
   * Layer visibility. A layer that is not in the map at all counts as visible — otherwise a
   * document written before layers existed would render as a blank board.
   */
  const hiddenLayers = useMemo(() => {
    const hidden = new Set();
    layers.forEach((l) => { if (l.visible === false) hidden.add(l.id); });
    return hidden;
  }, [layers]);

  const visible = useMemo(
    () => elements.filter((e) => !e.layerId || !hiddenLayers.has(e.layerId)),
    [elements, hiddenLayers]
  );

  const strokes = useMemo(() => visible.filter((e) => e.kind === KIND.STROKE), [visible]);
  const shapes = useMemo(() => visible.filter((e) => e.kind === KIND.SHAPE), [visible]);
  const texts = useMemo(() => visible.filter((e) => e.kind === KIND.TEXT), [visible]);
  const videos = useMemo(() => visible.filter((e) => e.kind === KIND.VIDEO), [visible]);
  const connectors = useMemo(() => visible.filter((e) => e.kind === KIND.CONNECTOR), [visible]);
  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  /**
   * Comment pins, anchored to the element each comment is attached to.
   * MOTION.md: pins scale in over 200ms; an unresolved pin carries the 2s status pulse;
   * a resolved one is static. Both handled in CSS.
   */
  const pins = useMemo(() => {
    if (!canvasRect) return [];
    const byElement = new Map();
    (comments || []).forEach((c) => {
      const list = byElement.get(c.elementId) || [];
      list.push(c);
      byElement.set(c.elementId, list);
    });

    const out = [];
    byElement.forEach((list, elementId) => {
      const el = elements.find((e) => e.id === elementId);
      if (!el) return;
      const anchor = el.points?.length
        ? { x: Math.max(...el.points.map((p) => p.x)), y: Math.min(...el.points.map((p) => p.y)) }
        : { x: (el.x || 0) + (el.width || 0), y: el.y || 0 };
      out.push({
        elementId,
        count: list.length,
        resolved: list.every((c) => c.resolved),
        left: anchor.x * camera.zoom + camera.x,
        top: anchor.y * camera.zoom + camera.y,
      });
    });
    return out;
  }, [comments, elements, camera, canvasRect]);

  const selectedText = useMemo(
    () => texts.find((t) => t.id === selectedTextId) || null,
    [texts, selectedTextId]
  );

  // Diff the element set each time it changes, and mark what moved for the flash pass.
  useEffect(() => {
    const now = performance.now();
    const next = new Map(elements.map((e) => [e.id, e]));
    const prev = prevElementsRef.current;

    if (prev.size > 0) {
      for (const [id, el] of prev) {
        if (!next.has(id)) flashRef.current.set(id, { at: now, element: el, removed: true });
      }
      for (const [id, el] of next) {
        if (!prev.has(id)) flashRef.current.set(id, { at: now, element: el, removed: false });
      }
    }

    prevElementsRef.current = next;
    dirtyRef.current = true;
  }, [elements]);

  // ── Tool shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!canDraw) return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;

      const byKey = { 1: 'pencil', 2: 'line', 3: 'rectangle', 4: 'circle', 5: 'text', 6: 'select' };
      if (byKey[e.key]) selectTool(byKey[e.key]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canDraw]);

  // ── Sizing. The bitmap is sized from the element's OWN box so pointer coordinates map
  //    1:1 to the ink; it used to be sized from the window while CSS gave the element a
  //    different box, which offset every stroke from the cursor. ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasRect({ left: rect.left, top: rect.top });

      const newWidth = Math.max(1, Math.round(rect.width));
      const newHeight = Math.max(1, Math.round(rect.height));
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        contextRef.current = ctx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        dirtyRef.current = true;
      }
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);
    window.addEventListener('scroll', resizeCanvas, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', resizeCanvas, true);
    };
  }, []);

  // ── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!contextRef.current) contextRef.current = canvas.getContext('2d');
    const ctx = contextRef.current;
    if (!ctx) return;

    dirtyRef.current = true;

    const render = () => {
      // A peer mid-stroke means the frame is never "clean": their line is still growing.
      if (peers.some((p) => p.liveStroke)) dirtyRef.current = true;
      if (!dirtyRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      dirtyRef.current = false;

      // Warm black, not white. The board is a surface in the SIGNAL system, not a sheet
      // of paper — and the CSS background alone does not touch the 2D bitmap.
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);

      strokes.forEach((stroke) => {
        if (!stroke.points?.length) return;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width / camera.zoom;
        ctx.beginPath();
        stroke.points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });

      // Connectors first, so their arrowheads tuck behind the boxes they point at.
      connectors.forEach((conn) => {
        const a = byId.get(conn.fromId);
        const b = byId.get(conn.toId);
        if (!a || !b) return;

        const ac = { x: (a.x || 0) + (a.width || 0) / 2, y: (a.y || 0) + (a.height || 0) / 2 };
        const bc = { x: (b.x || 0) + (b.width || 0) / 2, y: (b.y || 0) + (b.height || 0) / 2 };

        ctx.strokeStyle = conn.color || '#55504a';
        ctx.lineWidth = (conn.width || 1) / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(ac.x, ac.y);
        ctx.lineTo(bc.x, bc.y);
        ctx.stroke();

        // Arrowhead, stopped short of the target box edge.
        const angle = Math.atan2(bc.y - ac.y, bc.x - ac.x);
        const inset = Math.min((b.height || 40) / 2, (b.width || 80) / 2);
        const tipX = bc.x - Math.cos(angle) * inset;
        const tipY = bc.y - Math.sin(angle) * inset;
        const head = 7 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head * Math.cos(angle - 0.4), tipY - head * Math.sin(angle - 0.4));
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head * Math.cos(angle + 0.4), tipY - head * Math.sin(angle + 0.4));
        ctx.stroke();

        if (conn.label) {
          ctx.fillStyle = '#98928a';
          ctx.font = `${10 / camera.zoom}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(conn.label, (ac.x + bc.x) / 2, (ac.y + bc.y) / 2 - 4);
          ctx.textAlign = 'left';
        }
      });

      shapes.forEach((shape) => {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = (shape.width || 2) / camera.zoom;

        // Smart shapes and template shapes: a positioned box drawn by SHAPE_CONFIG.
        if (shape.smart && shape.x !== undefined) {
          renderSmartShape(ctx, shape);
        } else if (shape.type === 'line' && shape.points?.length === 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.stroke();
        } else if (shape.type === 'rectangle') {
          if (shape.bounds && shape.bounds.width !== undefined) {
            ctx.strokeRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height);
          } else if (shape.points?.length === 2) {
            const x = Math.min(shape.points[0].x, shape.points[1].x);
            const y = Math.min(shape.points[0].y, shape.points[1].y);
            ctx.strokeRect(
              x, y,
              Math.abs(shape.points[1].x - shape.points[0].x),
              Math.abs(shape.points[1].y - shape.points[0].y)
            );
          }
        } else if (shape.type === 'circle') {
          const c = shape.bounds?.center;
          if (c) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, shape.bounds.radius, 0, 2 * Math.PI);
            ctx.stroke();
          } else if (shape.points?.length === 2) {
            const cx = (shape.points[0].x + shape.points[1].x) / 2;
            const cy = (shape.points[0].y + shape.points[1].y) / 2;
            const r = Math.hypot(
              shape.points[1].x - shape.points[0].x,
              shape.points[1].y - shape.points[0].y
            ) / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.stroke();
          }
        }
      });

      // Peers' in-progress strokes, drawn progressively as their points stream in.
      peers.forEach((peer) => {
        const live = peer.liveStroke;
        if (!live?.points?.length) return;
        ctx.strokeStyle = live.color || '#f0ece4';
        ctx.lineWidth = (live.width || 2) / camera.zoom;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        live.points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      texts.forEach((t) => {
        const f = t.formatting || {};
        const size = f.fontSize || 16;
        ctx.fillStyle = t.color || '#f0ece4';
        ctx.font = `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(t.text || '', t.x, t.y);

        if (f.underline || f.strikethrough) {
          const w = ctx.measureText(t.text || '').width;
          ctx.strokeStyle = t.color || '#f0ece4';
          ctx.lineWidth = 1 / camera.zoom;
          const yOff = f.underline ? 4 : -size / 3;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y + yOff);
          ctx.lineTo(t.x + w, t.y + yOff);
          ctx.stroke();
        }

        if (t.id === selectedTextId) {
          const w = ctx.measureText(t.text || '').width;
          ctx.strokeStyle = '#ffb000';
          ctx.lineWidth = 1 / camera.zoom;
          ctx.strokeRect(t.x - 3, t.y - size, w + 6, size + 6);
        }
      });

      // ── Undo/redo flash (MOTION.md, 240ms) ──────────────────────────────
      const FLASH_MS = 240;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (flashRef.current.size > 0) {
        const nowMs = performance.now();
        for (const [id, entry] of flashRef.current) {
          const t = (nowMs - entry.at) / FLASH_MS;
          if (t >= 1 || reduced) { flashRef.current.delete(id); continue; }

          // Removed: ghost out from 50%. Added: ghost in to full.
          ctx.globalAlpha = entry.removed ? 0.5 * (1 - t) : 0.5 * (1 - t);
          const el = entry.element;
          if (el?.points?.length) {
            ctx.strokeStyle = el.color || '#f0ece4';
            ctx.lineWidth = (el.width || 2) / camera.zoom;
            ctx.beginPath();
            el.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          dirtyRef.current = true;
        }
      }

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [strokes, shapes, texts, connectors, byId, camera, selectedTextId, peers]);

  // ── Pointer handling ─────────────────────────────────────────────────────

  const toCanvasSpace = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom,
    };
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || (isDraggingCanvas && e.button === 0)) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const pt = toCanvasSpace(e);
    if (!pt) return;

    if (!canDraw) {
      // A viewer can still select an element to read or add comments on it.
      const hit = hitTest(pt);
      onSelectElement?.(hit);
      setSelectedTextId(texts.find((t) => t.id === hit) ? hit : null);
      return;
    }

    // Smart shape placement: one click drops the selected shape and clears the selection.
    if (selectedSmartShape) {
      const config = SHAPE_CONFIG[selectedSmartShape.type] || {};
      const w = config.defaultWidth || 120;
      const h = config.defaultHeight || 60;
      doc.placeSmartShape({
        type: selectedSmartShape.type,
        x: pt.x - w / 2,
        y: pt.y - h / 2,
        width: w,
        height: h,
        color,
        lineWidth,
        label: config.name || selectedSmartShape.type,
        connectorStyle: selectedSmartShape.connectorStyle || 'line',
        layerId: activeLayerId,
      });
      onSmartShapeCleared?.();
      return;
    }

    if (tool === 'select') {
      const hit = hitTest(pt);
      onSelectElement?.(hit);
      setSelectedTextId(texts.find((t) => t.id === hit) ? hit : null);
      return;
    }

    if (tool === 'text') {
      setTextDialogPos({ x: e.clientX, y: e.clientY });
      textInputPositionRef.current = pt;
      setTextDialogOpen(true);
      return;
    }

    setIsDrawing(true);
    doc?.setDrawing?.(true);
    setLastCompletedStroke(null);

    if (tool === 'pencil') currentStrokeRef.current = [pt];
    else shapeStartRef.current = pt;
  };

  const handleMouseMove = (e) => {
    const pt = toCanvasSpace(e);
    if (!pt) return;

    // Presence is broadcast BEFORE the permission gate: a viewer's cursor must still be
    // visible to everyone else. Presence is not a drawing permission.
    const now = Date.now();
    // One clock for both presence channels, so a peer's pen and its line stay attached.
    const presenceTick = now - lastCursorEmitRef.current >= CURSOR_THROTTLE_MS;
    if (presenceTick) {
      lastCursorEmitRef.current = now;
      doc?.setCursor?.(pt.x, pt.y);
    }

    if (!canDraw) return;

    if (isDraggingCanvas && dragStart) {
      const next = {
        x: camera.x + (e.clientX - dragStart.x),
        y: camera.y + (e.clientY - dragStart.y),
        zoom: camera.zoom,
      };
      setCamera(next);
      doc?.setCamera?.(next);
      setDragStart({ x: e.clientX, y: e.clientY });
      dirtyRef.current = true;
      return;
    }

    if (!isDrawing) return;

    if (tool === 'pencil' && currentStrokeRef.current) {
      currentStrokeRef.current.push(pt);

      // Stream the in-progress stroke so peers watch it draw, on that same tick.
      if (presenceTick) doc?.setLiveStroke?.(currentStrokeRef.current, color, lineWidth);

      // Local ink, drawn immediately. No buffering, no round trip.
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / camera.zoom;
      ctx.beginPath();
      const prev = currentStrokeRef.current[currentStrokeRef.current.length - 2];
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handleMouseUp = (e) => {
    setIsDraggingCanvas(false);
    if (!isDrawing) return;
    setIsDrawing(false);
    doc?.setDrawing?.(false);
    if (!canDraw) return;

    const pt = toCanvasSpace(e);
    if (!pt) return;

    if (tool === 'pencil' && currentStrokeRef.current?.length > 1) {
      const points = [...currentStrokeRef.current];
      // ONE document operation for the whole stroke — never one op per point.
      // Commit the canonical stroke FIRST, then drop the streamed preview. Doing it the
      // other way round leaves a one-frame gap where the line vanishes and reappears —
      // MOTION.md's "final reconciliation pass" has to be invisible.
      doc.addStroke({ points, color, width: lineWidth, layerId: activeLayerId });
      doc?.setLiveStroke?.(null);
      setLastCompletedStroke(points);
      currentStrokeRef.current = null;
      dirtyRef.current = true;
    } else if (shapeStartRef.current) {
      doc.addShape({
        type: tool,
        points: [shapeStartRef.current, pt],
        color,
        width: lineWidth,
        layerId: activeLayerId,
      });
      shapeStartRef.current = null;
      dirtyRef.current = true;
    }
  };

  const handleWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const next = {
      x: camera.x,
      y: camera.y,
      zoom: Math.max(0.5, Math.min(3, camera.zoom * factor)),
    };
    setCamera(next);
    doc?.setCamera?.(next);
    dirtyRef.current = true;
  };

  /** Cheap bounding-box hit test, newest element first. */
  const hitTest = useCallback((pt) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const pts = el.points;
      if (pts?.length) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const pad = (el.width || 2) + 6;
        if (
          pt.x >= Math.min(...xs) - pad && pt.x <= Math.max(...xs) + pad &&
          pt.y >= Math.min(...ys) - pad && pt.y <= Math.max(...ys) + pad
        ) return el.id;
      } else if (el.kind === KIND.TEXT) {
        if (Math.abs(pt.x - el.x) < 120 && Math.abs(pt.y - el.y) < 20) return el.id;
      }
    }
    return null;
  }, [elements]);

  const handleTextSubmit = (text) => {
    const pos = textInputPositionRef.current;
    if (pos && text) doc.addText({ text, x: pos.x, y: pos.y, color, layerId: activeLayerId });
    textInputPositionRef.current = null;
    setTextDialogOpen(false);
  };

  const handleRecognitionAccept = useCallback(({ shape, bounds }) => {
    if (!bounds) return;
    doc.addShape({ type: shape, points: [], bounds, color, width: lineWidth, recognized: true, layerId: activeLayerId });
    setLastCompletedStroke(null);
  }, [doc, color, lineWidth]);

  const getCursorStyle = () => {
    if (isDraggingCanvas) return 'grabbing';
    if (selectedSmartShape && canDraw) return 'cell';
    if (!canDraw) return 'not-allowed';
    if (tool === 'pencil') return 'crosshair';
    return 'default';
  };

  const TOOLS = [
    { id: 'pencil', glyph: '/', label: 'Pencil (freehand)', key: '1' },
    { id: 'line', glyph: '—', label: 'Line', key: '2' },
    { id: 'rectangle', glyph: '▢', label: 'Rectangle', key: '3' },
    { id: 'circle', glyph: '○', label: 'Circle', key: '4' },
    { id: 'text', glyph: 'T', label: 'Text', key: '5' },
    { id: 'select', glyph: '⌖', label: 'Select / comment', key: '6' },
  ];

  return (
    <div className="canvas-container">
      {textDialogOpen && (
        <TextInputDialog
          x={textDialogPos.x}
          y={textDialogPos.y}
          onSubmit={handleTextSubmit}
          onCancel={() => { textInputPositionRef.current = null; setTextDialogOpen(false); }}
        />
      )}

      <div className="canvas-toolbar" role="toolbar" aria-label="Drawing tools">
        <div className="tool-group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTool(t.id)}
              className={`tool-button ${tool === t.id ? 'active' : ''}`}
              disabled={!canDraw && t.id !== 'select'}
              title={`${t.label} (${t.key})`}
              aria-label={`${t.label} — press ${t.key}`}
              aria-pressed={tool === t.id}
            >
              {t.glyph}
            </button>
          ))}
        </div>

        {selectedSmartShape && (
          <div className="tool-group">
            <div className="smart-shape-active-indicator" title="Click the canvas to place">
              <span className="indicator-text">place</span>
            </div>
          </div>
        )}

        <div className="tool-group">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canDraw}
            title="Color picker"
            className="color-picker"
            aria-label="Stroke colour"
          />
        </div>

        <div className="tool-group">
          <label>
            Width:
            <input
              type="range" min="1" max="20" value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
              disabled={!canDraw}
              className="width-slider"
            />
            <span className="width-value">{lineWidth}px</span>
          </label>
        </div>

        <div className="tool-group">
          <span className="zoom-info" role="status" aria-live="polite"
                title="Ctrl+Scroll to zoom, middle-click to pan">
            {(camera.zoom * 100).toFixed(0)}%
          </span>
        </div>

        <div className="tool-group">
          <button
            className="tool-button"
            onClick={() => setShowExport(true)}
            title="Export the board (PNG / SVG / JSON)"
            aria-label="Export the board"
          >
            ↓
          </button>
        </div>

        <div className="tool-group">
          <span className={`role-indicator role-${userRole}`} role="status" aria-live="polite">
            {userRole === 'viewer' ? 'VIEW ONLY' : userRole === 'creator' ? 'CREATOR' : 'EDITOR'}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: getCursorStyle() }}
        aria-label="Collaborative drawing canvas — keys 1-6 select tools, Ctrl+Scroll zooms, middle-click pans"
        tabIndex={0}
      />

      {/* Props follow the component's ACTUAL signature, which its own JSDoc block
          contradicts — the real one is (isVisible, selectedTextId, onFormatChange,
          currentFormatting). Keyed on the selection so its internal toggle state resets
          when a different text box is picked. */}
      <TextFormattingToolbar
        key={selectedTextId || 'none'}
        isVisible={!!selectedText && canDraw}
        selectedTextId={selectedTextId}
        currentFormatting={selectedText?.formatting || {}}
        onFormatChange={(id, formatting) => doc.setTextFormatting(id, formatting)}
      />

      <VideoEmbedCanvas
        videoEmbeds={videos}
        camera={camera}
        onMove={(id, x, y) => doc.moveVideoEmbed(id, x, y)}
        onRemove={(id) => doc.removeVideoEmbed(id)}
        canEdit={canDraw}
      />

      <div className="comment-pins">
        {pins.map((pin) => (
          <button
            key={pin.elementId}
            type="button"
            className={`comment-pin ${pin.resolved ? 'resolved' : 'unresolved'}`}
            style={{ left: pin.left, top: pin.top }}
            title={`${pin.count} comment${pin.count > 1 ? 's' : ''}${pin.resolved ? ' (resolved)' : ''}`}
            onClick={() => onSelectElement?.(pin.elementId)}
          >
            {pin.resolved ? '✓' : pin.count}
          </button>
        ))}
      </div>

      <CursorPresence
        peers={peers}
        currentUserId={currentUserId}
        camera={camera}
        canvasRect={canvasRect}
      />

      <PresenceHalo peers={peers} camera={camera} canvasRect={canvasRect} />

      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={() => setShowExport(false)}
        canvasRef={canvasRef}
        /* ExportDialog's JSON path expects { strokes, shapes, textBoxes }; give it a view
           of the document in exactly that shape rather than changing its contract. */
        sessionState={{ strokes, shapes, textBoxes: texts }}
      />

      <ShapeRecognition
        currentStroke={lastCompletedStroke}
        onAcceptSuggestion={handleRecognitionAccept}
        isDrawing={isDrawing}
      />

      {!canDraw && (
        <div className="view-only-overlay">
          <div className="overlay-message">VIEW ONLY</div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Draw a smart shape or template shape: a positioned box with an optional label.
 * Falls back to a plain rectangle when SHAPE_CONFIG has no renderer for the type, so an
 * unknown shape is still visible rather than silently missing from the board.
 */
function renderSmartShape(ctx, shape) {
  const {
    type, x, y, width = 120, height = 60,
    color = '#f0ece4', lineWidth: lw = 2, label,
  } = shape;

  const config = SHAPE_CONFIG[type];

  if (config?.draw) {
    config.draw(ctx, x, y, width, height, color, lw);
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, width, height);
  }

  if (label) {
    ctx.fillStyle = color;
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width / 2, y + height / 2 + 4);
    ctx.textAlign = 'left';
  }
}
