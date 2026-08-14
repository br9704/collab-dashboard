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
import { KIND } from '../collab/doc';
import './Canvas.css';

/**
 * @param {Object}   props
 * @param {Object}   props.sessionState    - control plane (members, roles)
 * @param {Object}   props.doc             - useCollabDoc: elements, peers, mutations
 * @param {string}   props.currentUserId
 * @param {string}   props.userRole        - 'creator' | 'editor' | 'viewer'
 * @param {Function} props.onSelectElement
 */
export default function Canvas({ doc, currentUserId, userRole, onSelectElement }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#111111');
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

  const currentStrokeRef = useRef(null);
  const shapeStartRef = useRef(null);
  const textInputPositionRef = useRef(null);

  const dirtyRef = useRef(true);
  const animationFrameRef = useRef(null);

  // Separate clocks: sharing one made panning starve cursor broadcasts.
  const lastCursorEmitRef = useRef(0);
  const CURSOR_THROTTLE_MS = 33; // ~30fps

  const canDraw = userRole !== 'viewer';

  const elements = doc?.elements || [];
  const peers = doc?.peers || [];

  const strokes = useMemo(() => elements.filter((e) => e.kind === KIND.STROKE), [elements]);
  const shapes = useMemo(() => elements.filter((e) => e.kind === KIND.SHAPE), [elements]);
  const texts = useMemo(() => elements.filter((e) => e.kind === KIND.TEXT), [elements]);

  // ── Tool shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!canDraw) return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;

      const byKey = { 1: 'pencil', 2: 'line', 3: 'rectangle', 4: 'circle', 5: 'text' };
      if (byKey[e.key]) setTool(byKey[e.key]);
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
      if (!dirtyRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      dirtyRef.current = false;

      ctx.fillStyle = '#ffffff';
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

      shapes.forEach((shape) => {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = (shape.width || 2) / camera.zoom;

        if (shape.type === 'line' && shape.points?.length === 2) {
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

      texts.forEach((t) => {
        ctx.fillStyle = t.color || '#111111';
        ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(t.text || '', t.x, t.y);
      });

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [strokes, shapes, texts, camera]);

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
      onSelectElement?.(hitTest(pt));
      return;
    }

    if (tool === 'select') {
      onSelectElement?.(hitTest(pt));
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
    if (now - lastCursorEmitRef.current >= CURSOR_THROTTLE_MS) {
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
      doc.addStroke({ points, color, width: lineWidth });
      setLastCompletedStroke(points);
      currentStrokeRef.current = null;
      dirtyRef.current = true;
    } else if (shapeStartRef.current) {
      doc.addShape({
        type: tool,
        points: [shapeStartRef.current, pt],
        color,
        width: lineWidth,
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
    if (pos && text) doc.addText({ text, x: pos.x, y: pos.y, color });
    textInputPositionRef.current = null;
    setTextDialogOpen(false);
  };

  const handleRecognitionAccept = useCallback(({ shape, bounds }) => {
    if (!bounds) return;
    doc.addShape({ type: shape, points: [], bounds, color, width: lineWidth, recognized: true });
    setLastCompletedStroke(null);
  }, [doc, color, lineWidth]);

  const getCursorStyle = () => {
    if (isDraggingCanvas) return 'grabbing';
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
              onClick={() => setTool(t.id)}
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

      <CursorPresence
        peers={peers}
        currentUserId={currentUserId}
        camera={camera}
        canvasRect={canvasRect}
      />

      <PresenceHalo peers={peers} camera={camera} canvasRect={canvasRect} />

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
