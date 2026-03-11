/**
 * Canvas - Core drawing surface component (v4)
 *
 * Handles all drawing interactions and renders collaborative content:
 * - Freehand strokes (pencil)
 * - Geometric shapes (line, rectangle, circle)
 * - Text boxes
 * - Smart shape placement (v4 Feature 2)
 * - AI shape completion suggestion (v4 Feature 3)
 * - Embedded video overlays (v4 Feature 4)
 *
 * Camera transform (pan/zoom) is applied to all canvas content.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import TextInputDialog from './TextInputDialog';
import TextFormattingToolbar from './TextFormattingToolbar';
import ExportDialog from './ExportDialog';
import AICompletion from './AICompletion';
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

  // ─── v4 Feature 3: AI Shape Completion ─────────────────────────────────
  /**
   * Holds the stroke points of the most recently completed freehand draw.
   * Passed to AICompletion for shape recognition.  Cleared after
   * the user accepts / dismisses the suggestion or starts a new stroke.
   */
  const [lastCompletedStroke, setLastCompletedStroke] = useState(null);

  // Whether the user is actively dragging a stroke (prevents stale suggestions)
  const isDrawingRef = useRef(false);

  // Viewers cannot draw
  const canDraw = userRole !== 'viewer';

  // ── Camera sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionState.camera) {
      setCamera(sessionState.camera);
    }
  }, [sessionState.camera]);

  // ── Canvas redraw ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth - 200;
    canvas.height = window.innerHeight - 100;

    const ctx = canvas.getContext('2d');
    contextRef.current = ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    /** Check if a layer is visible */
    const isLayerVisible = (layerId) => {
      if (!sessionState.layers || sessionState.layers.length === 0) return true;
      const layer = sessionState.layers.find(l => l.id === layerId);
      return layer ? layer.visible !== false : true;
    };

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
  }, [
    sessionState.strokes,
    sessionState.shapes,
    sessionState.textBoxes,
    sessionState.textFormatting,
    sessionState.layers,
    camera,
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
      window.textInputPosition = { x, y };
      setTextDialogOpen(true);
      return;
    }

    setIsDrawing(true);
    isDrawingRef.current = true;
    setLastCompletedStroke(null); // Clear previous AI suggestion on new stroke

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (tool === 'pencil') {
      window.currentStroke = [{ x, y }];
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      window.shapeStart = { x, y };
      window.shapePoints = [{ x, y }];
    }
  };

  const handleMouseMove = (e) => {
    if (!canDraw) return;

    // Canvas panning
    if (isDraggingCanvas && dragStart) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const newCamera = {
        x: camera.x + deltaX,
        y: camera.y + deltaY,
        zoom: camera.zoom,
        timestamp: Date.now(),
      };
      setCamera(newCamera);
      socket?.emit('camera-change', newCamera);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!isDrawing) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (tool === 'pencil' && window.currentStroke) {
      window.currentStroke.push({ x, y });

      // Live preview segment
      const ctx = canvasRef.current.getContext('2d');
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      const prev = window.currentStroke[window.currentStroke.length - 2];
      ctx.moveTo(prev.x + camera.x, prev.y + camera.y);
      ctx.lineTo(x + camera.x, y + camera.y);
      ctx.stroke();
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

    if (tool === 'pencil' && window.currentStroke && window.currentStroke.length > 1) {
      const completedStroke = [...window.currentStroke];

      socket?.emit('stroke-draw', { points: completedStroke, color, width: lineWidth });

      // ── v4 Feature 3: Pass completed stroke to AI completion ────────
      setLastCompletedStroke(completedStroke);
      window.currentStroke = null;

    } else if (window.shapeStart) {
      socket?.emit('shape-draw', {
        type: tool,
        points: [window.shapeStart, { x, y }],
        color,
        width: lineWidth,
      });
      window.shapeStart = null;
      window.shapePoints = null;
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
    }
  };

  // ── Text handlers ────────────────────────────────────────────────────────

  const handleTextSubmit = (text) => {
    const pos = window.textInputPosition;
    if (pos) {
      socket?.emit('text-add', { text, x: pos.x, y: pos.y, color });
      window.textInputPosition = null;
    }
    setTextDialogOpen(false);
  };

  const handleTextCancel = () => {
    window.textInputPosition = null;
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

  // ── v4 Feature 3: AI completion acceptance ───────────────────────────────

  /**
   * Accept an AI shape suggestion and emit it as a shape on the canvas.
   *
   * @param {Object} suggestion - { shape, bounds, originalPoints }
   */
  const handleAIAccept = useCallback(({ shape, bounds }) => {
    if (!bounds) return;

    const shapeData = {
      type: shape,
      bounds,
      color,
      width: lineWidth,
      aiGenerated: true,
      createdAt: Date.now(),
    };

    socket?.emit('ai-shape-accept', shapeData);
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
      <div className="canvas-toolbar">
        <div className="tool-group">
          <button
            onClick={() => setTool('pencil')}
            className={`tool-button ${tool === 'pencil' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Pencil (freehand)"
          >
            ✏️
          </button>
          <button
            onClick={() => setTool('line')}
            className={`tool-button ${tool === 'line' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Line"
          >
            📏
          </button>
          <button
            onClick={() => setTool('rectangle')}
            className={`tool-button ${tool === 'rectangle' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Rectangle"
          >
            ▭
          </button>
          <button
            onClick={() => setTool('circle')}
            className={`tool-button ${tool === 'circle' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Circle"
          >
            ⭕
          </button>
          <button
            onClick={() => setTool('text')}
            className={`tool-button ${tool === 'text' ? 'active' : ''}`}
            disabled={!canDraw}
            title="Text"
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
          <span className="zoom-info" title="Ctrl+Scroll to zoom, Middle-click to pan">
            🔍 {(camera.zoom * 100).toFixed(0)}%
          </span>
        </div>

        <div className="tool-group">
          <button
            onClick={() => setShowExportDialog(true)}
            className="tool-button"
            disabled={!canDraw}
            title="Export drawing"
          >
            💾
          </button>
        </div>

        <div className="tool-group">
          <span className={`role-indicator role-${userRole}`}>
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
      />

      {/* v4 Feature 4: Video embed overlays */}
      <VideoEmbedCanvas
        videoEmbeds={sessionState.videoEmbeds || []}
        camera={camera}
        onMove={handleVideoEmbedMove}
        onRemove={handleVideoEmbedRemove}
        canEdit={canDraw}
      />

      {/* v4 Feature 3: AI shape completion suggestion */}
      <AICompletion
        currentStroke={lastCompletedStroke}
        onAcceptSuggestion={handleAIAccept}
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
