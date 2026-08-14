/**
 * Canvas - Core drawing surface component (v4)
 *
 * Handles all drawing interactions and renders collaborative content:
 * - Freehand strokes (pencil)
 * - Geometric shapes (line, rectangle, circle)
 * - Text boxes
 * - Smart shape placement (v4 Feature 2)
 * - Shape-recognition suggestion (v4 Feature 3)
 * - Embedded video overlays (v4 Feature 4)
 *
 * Camera transform (pan/zoom) is applied to all canvas content.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import TextInputDialog from './TextInputDialog';
import CursorPresence from './CursorPresence';
import TextFormattingToolbar from './TextFormattingToolbar';
import ExportDialog from './ExportDialog';
import ShapeRecognition from './ShapeRecognition';
import VideoEmbedCanvas from './VideoEmbedCanvas';
import { SHAPE_CONFIG, SHAPE_TYPES } from '../utils/shapeUtils';
import './Canvas.css';

/**
 * @param {Object}   props
 * @param {Object}   props.socket              - Socket.io client instance
 * @param {Object}   props.sessionState        - Full session state from useSessionState
 * @param {string}   props.currentUserId       - Current user's socket ID
 * @param {string}   props.userRole            - 'creator' | 'editor' | 'viewer'
 * @param {Object}   [props.selectedSmartShape] - { type, connectorStyle } from SmartShapes panel
 * @param {Function} [props.onSmartShapeCleared] - Called after a smart shape is placed
 */
export default function Canvas({
  socket,
  sessionState,
  currentUserId,
  userRole,
  selectedSmartShape,
  onSmartShapeCleared,
}) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(2);

  // Camera / pan state
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  // Text input dialog state
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textDialogPos, setTextDialogPos] = useState({ x: 0, y: 0 });

  // v3 Feature 1: Text Formatting
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);

  // v3 Feature 3: Export dialog
  const [showExportDialog, setShowExportDialog] = useState(false);

  // ─── v4 Feature 3: Shape recognition ─────────────────────────────────
  /**
   * Holds the stroke points of the most recently completed freehand draw.
   * Passed to ShapeRecognition for shape recognition.  Cleared after
   * the user accepts / dismisses the suggestion or starts a new stroke.
   */
  const [lastCompletedStroke, setLastCompletedStroke] = useState(null);

  // Whether the user is actively dragging a stroke (prevents stale suggestions)
  const isDrawingRef = useRef(false);

  // PERFORMANCE: Replace window globals with refs
  const currentStrokeRef = useRef(null);
  const shapeStartRef = useRef(null);
  const textInputPositionRef = useRef(null);

  // PERFORMANCE: Dirty flag and animation frame tracking
  const dirtyRef = useRef(true);
  const animationFrameRef = useRef(null);

  // PERFORMANCE: Throttle tracking. Cursor and camera get SEPARATE clocks — they shared one
  // before, which meant panning starved cursor broadcasts (and vice versa).
  const lastCursorEmitRef = useRef(0);
  const lastCameraEmitRef = useRef(0);
  const CURSOR_THROTTLE_MS = 33; // ~30fps

  // Viewers cannot draw
  const canDraw = userRole !== 'viewer';

  // ── Camera sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionState.camera) {
      setCamera(sessionState.camera);
    }
  }, [sessionState.camera]);

  // ── Keyboard shortcuts for tool selection ────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!canDraw) return;

      // Only trigger if canvas is focused or no input is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' ||
                             activeElement?.tagName === 'TEXTAREA' ||
                             activeElement?.isContentEditable;

      if (isInputFocused) return;

      switch (e.key) {
        case '1':
          setTool('pencil');
          break;
        case '2':
          setTool('line');
          break;
        case '3':
          setTool('rectangle');
          break;
        case '4':
          setTool('circle');
          break;
        case '5':
          setTool('text');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canDraw]);

  // PERFORMANCE: Memoize layer visibility map
  const layerVisibilityMap = useMemo(() => {
    const map = new Map();
    if (!sessionState.layers || sessionState.layers.length === 0) {
      return map; // Empty map means all layers visible
    }
    sessionState.layers.forEach(layer => {
      map.set(layer.id, layer.visible !== false);
    });
    return map;
  }, [sessionState.layers]);

  // PERFORMANCE: Helper to check layer visibility using memoized map
  const isLayerVisible = useCallback((layerId) => {
    if (layerVisibilityMap.size === 0) return true;
    return layerVisibilityMap.get(layerId) !== false;
  }, [layerVisibilityMap]);

  // PERFORMANCE: Canvas resize observer (only set dimensions on actual resize)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      // Size the bitmap from the element's OWN box, not from the window. It used to be
      // `window.innerWidth - 200` while CSS gave the element `flex: 1` plus margin and
      // padding — so the bitmap was stretched to a different size than it was drawn at, and
      // every pointer coordinate landed offset from the ink. Reading the rect keeps the
      // pointer→bitmap mapping exactly 1:1.
      const rect = canvas.getBoundingClientRect();
      const newWidth = Math.max(1, Math.round(rect.width));
      const newHeight = Math.max(1, Math.round(rect.height));

      // Only update if dimensions actually changed
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Re-initialize context settings after resize
        const ctx = canvas.getContext('2d');
        contextRef.current = ctx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        dirtyRef.current = true; // Mark for redraw
      }
    };

    // Initial size
    resizeCanvas();

    // Use ResizeObserver for efficient resize detection
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // PERFORMANCE: Optimized canvas redraw with requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = contextRef.current;
    if (!ctx) return;

    // Mark dirty when dependencies change
    dirtyRef.current = true;

    // Render function using requestAnimationFrame
    const render = () => {
      if (!dirtyRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      dirtyRef.current = false;

      // Clear canvas
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply camera transform
      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);

      // Draw freehand strokes
      sessionState.strokes.forEach(stroke => {
        if (!isLayerVisible(stroke.layerId)) return;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width / camera.zoom;
        ctx.beginPath();
        stroke.points.forEach((point, idx) => {
          if (idx === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      });

      // Draw shapes (including smart shapes)
      sessionState.shapes.forEach(shape => {
        if (!isLayerVisible(shape.layerId)) return;
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = (shape.width || 2) / camera.zoom;

        if (shape.type === 'line' && shape.points?.length === 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.stroke();

        } else if (shape.type === 'rectangle') {
          if (shape.bounds) {
            ctx.strokeRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height);
          } else if (shape.points?.length === 2) {
            const x = Math.min(shape.points[0].x, shape.points[1].x);
            const y = Math.min(shape.points[0].y, shape.points[1].y);
            const w = Math.abs(shape.points[1].x - shape.points[0].x);
            const h = Math.abs(shape.points[1].y - shape.points[0].y);
            ctx.strokeRect(x, y, w, h);
          } else if (shape.x !== undefined) {
            // Placed smart shape or template shape
            renderSmartShape(ctx, shape);
          }

        } else if (shape.type === 'circle') {
          if (shape.bounds?.center) {
            ctx.beginPath();
            ctx.arc(shape.bounds.center.x, shape.bounds.center.y, shape.bounds.radius, 0, 2 * Math.PI);
            ctx.stroke();
          } else if (shape.x !== undefined) {
            renderSmartShape(ctx, shape);
          }

        } else if (shape.x !== undefined) {
          // Smart shape / template shape with x, y, width, height
          renderSmartShape(ctx, shape);
        }
      });

      // Draw text boxes
      sessionState.textBoxes.forEach(textBox => {
        if (!isLayerVisible(textBox.layerId)) return;
        ctx.fillStyle = textBox.color || '#000000';
        const formatting = sessionState.textFormatting?.[textBox.id] || {};
        const fontSize = formatting.fontSize || 16;
        const bold = formatting.bold ? 'bold ' : '';
        const italic = formatting.italic ? 'italic ' : '';
        ctx.font = `${italic}${bold}${fontSize}px Arial`;
        ctx.fillText(textBox.text, textBox.x, textBox.y);

        if (formatting.underline) {
          const metrics = ctx.measureText(textBox.text);
          ctx.strokeStyle = textBox.color || '#000000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(textBox.x, textBox.y + 4);
          ctx.lineTo(textBox.x + metrics.width, textBox.y + 4);
          ctx.stroke();
        }
        if (formatting.strikethrough) {
          const metrics = ctx.measureText(textBox.text);
          ctx.strokeStyle = textBox.color || '#000000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(textBox.x, textBox.y - fontSize / 3);
          ctx.lineTo(textBox.x + metrics.width, textBox.y - fontSize / 3);
          ctx.stroke();
        }
      });

      ctx.restore();

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Start render loop
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    sessionState.strokes,
    sessionState.shapes,
    sessionState.textBoxes,
    sessionState.textFormatting,
    camera,
    isLayerVisible,
  ]);

  // ── Event handlers ───────────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    // Middle-click or spacebar drag = pan
    if (e.button === 1 || (isDraggingCanvas && e.button === 0)) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // ── v4 Feature 2: Smart shape placement ──────────────────────────────
    if (selectedSmartShape && canDraw) {
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - camera.x) / camera.zoom;
      const canvasY = (e.clientY - rect.top - camera.y) / camera.zoom;
      handleSmartShapePlace(canvasX, canvasY);
      return;
    }

    if (!canDraw) return;

    if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - camera.x) / camera.zoom;
      const y = (e.clientY - rect.top - camera.y) / camera.zoom;
      setTextDialogPos({ x: e.clientX, y: e.clientY });
      textInputPositionRef.current = { x, y };
      setTextDialogOpen(true);
      return;
    }

    setIsDrawing(true);
    isDrawingRef.current = true;
    setLastCompletedStroke(null); // Clear previous recognition suggestion on new stroke

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (tool === 'pencil') {
      currentStrokeRef.current = [{ x, y }];
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      shapeStartRef.current = { x, y };
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Canvas-space coordinates. Cursors are broadcast in this space, not screen space, so a
    // remote cursor stays attached to the board content when either side pans or zooms.
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    // Broadcast presence BEFORE the permission gate. `moveCursor` existed in useSessionState
    // but was called by nothing, so `cursor-move` was never emitted by the app at all and
    // live cursors — the headline feature — never transmitted. A viewer's cursor must be
    // visible too, so this deliberately sits above the canDraw check.
    const now = Date.now();
    if (now - lastCursorEmitRef.current >= CURSOR_THROTTLE_MS) {
      lastCursorEmitRef.current = now;
      socket?.emit('cursor-move', { x, y });
    }

    if (!canDraw) return;

    // Canvas panning
    if (isDraggingCanvas && dragStart) {
      // PERFORMANCE: Throttle camera updates (30fps max)
      const shouldEmit = now - lastCameraEmitRef.current >= CURSOR_THROTTLE_MS;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const newCamera = {
        x: camera.x + deltaX,
        y: camera.y + deltaY,
        zoom: camera.zoom,
        timestamp: now,
      };
      setCamera(newCamera);

      if (shouldEmit) {
        socket?.emit('camera-change', newCamera);
        lastCameraEmitRef.current = now;
      }

      setDragStart({ x: e.clientX, y: e.clientY });
      dirtyRef.current = true; // Mark for redraw
      return;
    }

    if (!isDrawing) return;

    if (tool === 'pencil' && currentStrokeRef.current) {
      currentStrokeRef.current.push({ x, y });

      // PERFORMANCE: Live preview with proper camera transform
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / camera.zoom;
      ctx.beginPath();
      const prev = currentStrokeRef.current[currentStrokeRef.current.length - 2];
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.restore();
    }
  };

  const handleMouseUp = (e) => {
    setIsDraggingCanvas(false);

    if (!isDrawing) return;
    setIsDrawing(false);
    isDrawingRef.current = false;

    if (!canDraw) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (tool === 'pencil' && currentStrokeRef.current && currentStrokeRef.current.length > 1) {
      const completedStroke = [...currentStrokeRef.current];

      socket?.emit('stroke-draw', { points: completedStroke, color, width: lineWidth });

      // ── v4 Feature 3: Pass completed stroke to shape recognition ────────
      setLastCompletedStroke(completedStroke);
      currentStrokeRef.current = null;

      // Mark for full redraw to clear live preview
      dirtyRef.current = true;

    } else if (shapeStartRef.current) {
      socket?.emit('shape-draw', {
        type: tool,
        points: [shapeStartRef.current, { x, y }],
        color,
        width: lineWidth,
      });
      shapeStartRef.current = null;

      // Mark for redraw
      dirtyRef.current = true;
    }
  };

  const handleWheel = (e) => {
    if ((e.ctrlKey || e.metaKey) && canDraw) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.5, Math.min(3, camera.zoom * zoomFactor));
      const newCamera = { x: camera.x, y: camera.y, zoom: newZoom, timestamp: Date.now() };
      setCamera(newCamera);
      socket?.emit('camera-change', newCamera);
      dirtyRef.current = true; // Mark for redraw
    }
  };

  // ── Text handlers ────────────────────────────────────────────────────────

  const handleTextSubmit = (text) => {
    const pos = textInputPositionRef.current;
    if (pos) {
      socket?.emit('text-add', { text, x: pos.x, y: pos.y, color });
      textInputPositionRef.current = null;
    }
    setTextDialogOpen(false);
  };

  const handleTextCancel = () => {
    textInputPositionRef.current = null;
    setTextDialogOpen(false);
  };

  const handleFormatChange = (textId, formatting) => {
    socket?.emit('text-formatting-update', { textId, formatting });
  };

  // ── v4 Feature 2: Smart shape placement ──────────────────────────────────

  /**
   * Place a smart shape at the given canvas coordinates.
   * Emits socket event and optimistically notifies parent to clear the selection.
   *
   * @param {number} canvasX - X in canvas coordinate space
   * @param {number} canvasY - Y in canvas coordinate space
   */
  const handleSmartShapePlace = useCallback((canvasX, canvasY) => {
    if (!selectedSmartShape) return;

    const { type, connectorStyle } = selectedSmartShape;
    const config = SHAPE_CONFIG[type] || {};
    const w = config.defaultWidth || 100;
    const h = config.defaultHeight || 60;

    const shapeData = {
      type,
      x: canvasX - w / 2,
      y: canvasY - h / 2,
      width: w,
      height: h,
      color,
      lineWidth,
      label: config.name || type,
      connectorStyle: connectorStyle || 'line',
      createdAt: Date.now(),
    };

    socket?.emit('smart-shape-place', shapeData);
    onSmartShapeCleared?.();
  }, [selectedSmartShape, color, lineWidth, socket, onSmartShapeCleared]);

  // ── v4 Feature 3: Shape-recognition acceptance ───────────────────────────────

  /**
   * Accept a recognised-shape suggestion and emit it as a shape on the canvas.
   *
   * @param {Object} suggestion - { shape, bounds, originalPoints }
   */
  const handleRecognitionAccept = useCallback(({ shape, bounds }) => {
    if (!bounds) return;

    const shapeData = {
      type: shape,
      bounds,
      color,
      width: lineWidth,
      recognized: true,
      createdAt: Date.now(),
    };

    socket?.emit('shape-recognition-accept', shapeData);
    setLastCompletedStroke(null);
  }, [color, lineWidth, socket]);

  // ── v4 Feature 4: Video embed movement ───────────────────────────────────

  /**
   * Handle video embed position update.
   * Updates local state and broadcasts to other users.
   *
   * @param {string} id - Embed ID
   * @param {number} x  - New canvas X
   * @param {number} y  - New canvas Y
   */
  const handleVideoEmbedMove = useCallback((id, x, y) => {
    sessionState.setVideoEmbedsLocal?.(prev =>
      prev.map(v => (v.id === id ? { ...v, x, y } : v))
    );
    socket?.emit('video-embed-move', { id, x, y });
  }, [sessionState, socket]);

  /**
   * Handle video embed removal.
   *
   * @param {string} id - Embed ID to remove
   */
  const handleVideoEmbedRemove = useCallback((id) => {
    sessionState.setVideoEmbedsLocal?.(prev => prev.filter(v => v.id !== id));
    socket?.emit('video-embed-remove', id);
  }, [sessionState, socket]);

  // ── Export ───────────────────────────────────────────────────────────────

  const handleExport = () => {
    // Export is handled inside ExportDialog
  };

  // ── Cursor style ─────────────────────────────────────────────────────────

  const getCursorStyle = () => {
    if (isDraggingCanvas) return 'grabbing';
    if (selectedSmartShape && canDraw) return 'cell';
    if (!canDraw) return 'not-allowed';
    if (tool === 'pencil') return 'crosshair';
    return 'default';
  };

  return (
    <div className="canvas-container">
      {/* Text input dialog */}
      {textDialogOpen && (
        <TextInputDialog
          x={textDialogPos.x}
          y={textDialogPos.y}
          onSubmit={handleTextSubmit}
          onCancel={handleTextCancel}
        />
      )}

      {/* v3 Feature 1: Text formatting toolbar */}
      <TextFormattingToolbar
        isVisible={showFormattingToolbar}
        selectedTextId={selectedTextId}
        onFormatChange={handleFormatChange}
        currentFormatting={sessionState.textFormatting?.[selectedTextId] || {}}
      />

      {/* v3 Feature 3: Export dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExport}
        canvasRef={canvasRef}
        sessionState={sessionState}
      />

      {/* Main toolbar */}
      <div className="canvas-toolbar" role="toolbar" aria-label="Drawing tools">
        <div className="tool-group">
          <button
            onClick={() => setTool('pencil')}
            className={`tool-button ${tool === 'pencil' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Pencil (freehand)"
            aria-label="Pencil tool - Draw freehand strokes (Press 1)"
            aria-pressed={tool === 'pencil'}
          >
            ✏️
          </button>
          <button
            onClick={() => setTool('line')}
            className={`tool-button ${tool === 'line' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Line"
            aria-label="Line tool - Draw straight lines (Press 2)"
            aria-pressed={tool === 'line'}
          >
            📏
          </button>
          <button
            onClick={() => setTool('rectangle')}
            className={`tool-button ${tool === 'rectangle' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Rectangle"
            aria-label="Rectangle tool - Draw rectangles (Press 3)"
            aria-pressed={tool === 'rectangle'}
          >
            ▭
          </button>
          <button
            onClick={() => setTool('circle')}
            className={`tool-button ${tool === 'circle' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Circle"
            aria-label="Circle tool - Draw circles (Press 4)"
            aria-pressed={tool === 'circle'}
          >
            ⭕
          </button>
          <button
            onClick={() => setTool('text')}
            className={`tool-button ${tool === 'text' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Text"
            aria-label="Text tool - Add text to canvas (Press 5)"
            aria-pressed={tool === 'text'}
          >
            📝
          </button>
        </div>

        {/* v4: Smart shape indicator */}
        {selectedSmartShape && (
          <div className="tool-group">
            <div className="smart-shape-active-indicator" title="Click canvas to place shape">
              <span>{SHAPE_CONFIG[selectedSmartShape.type]?.icon || '⬜'}</span>
              <span className="indicator-text">Click to place</span>
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
          />
        </div>

        <div className="tool-group">
          <label>
            Width:
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              disabled={!canDraw}
              className="width-slider"
            />
            <span className="width-value">{lineWidth}px</span>
          </label>
        </div>

        <div className="tool-group">
          <span className="zoom-info" title="Ctrl+Scroll to zoom, Middle-click to pan" role="status" aria-live="polite">
            🔍 {(camera.zoom * 100).toFixed(0)}%
          </span>
        </div>

        <div className="tool-group">
          <button
            onClick={() => setShowExportDialog(true)}
            className="tool-button"
            disabled={!canDraw}
            title="Export drawing"
            aria-label="Export drawing to file"
          >
            💾
          </button>
        </div>

        <div className="tool-group">
          <span className={`role-indicator role-${userRole}`} role="status" aria-live="polite">
            {userRole === 'viewer' ? '👁️ View Only' : userRole === 'creator' ? '👑 Creator' : '✏️ Editor'}
          </span>
        </div>
      </div>

      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: getCursorStyle() }}
        aria-label="Collaborative drawing canvas - Use keyboard shortcuts 1-5 to select tools, Ctrl+Scroll to zoom, Middle-click to pan"
        tabIndex={0}
      />

      {/* Remote cursors. Rendered here, not in App, because placing a canvas-space point
          needs the canvas element's rect and the local camera — both of which live here. */}
      <CursorPresence
        cursors={sessionState.cursors}
        users={sessionState.users}
        currentUserId={currentUserId}
        camera={camera}
        canvasRef={canvasRef}
      />

      {/* v4 Feature 4: Video embed overlays */}
      <VideoEmbedCanvas
        videoEmbeds={sessionState.videoEmbeds || []}
        camera={camera}
        onMove={handleVideoEmbedMove}
        onRemove={handleVideoEmbedRemove}
        canEdit={canDraw}
      />

      {/* v4 Feature 3: Shape recognition suggestion */}
      <ShapeRecognition
        currentStroke={lastCompletedStroke}
        onAcceptSuggestion={handleRecognitionAccept}
        isDrawing={isDrawing}
      />

      {!canDraw && (
        <div className="view-only-overlay">
          <div className="overlay-message">👁️ View Only Mode</div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render a smart shape or template shape that has x, y, width, height
 * Uses SHAPE_CONFIG draw functions when available.
 *
 * @param {CanvasRenderingContext2D} ctx   - Canvas 2D context
 * @param {Object}                  shape - Shape data object
 */
function renderSmartShape(ctx, shape) {
  const { type, x, y, width = 100, height = 60, color = '#333333', lineWidth: lw = 2, label } = shape;

  const config = SHAPE_CONFIG[type];

  if (config?.draw) {
    // Use registered draw function
    config.draw(ctx, x, y, width, height, color, lw);
  } else {
    // Fallback: draw as rectangle
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, width, height);
  }

  // Draw label if present
  if (label) {
    ctx.fillStyle = color;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width / 2, y + height / 2 + 4);
    ctx.textAlign = 'left'; // Reset
  }
}
