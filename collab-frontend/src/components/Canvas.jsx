import { useEffect, useRef, useState } from 'react';
import './Canvas.css';

export default function Canvas({ socket, sessionState, currentUserId, userRole }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(2);
  
  // Sprint 13-14: Camera/zoom state
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  // Detect pencil drawing disabled for viewers
  const canDraw = userRole !== 'viewer';

  // Update local camera state when server updates it
  useEffect(() => {
    if (sessionState.camera) {
      setCamera(sessionState.camera);
    }
  }, [sessionState.camera]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    canvas.width = window.innerWidth - 200;
    canvas.height = window.innerHeight - 100;

    const ctx = canvas.getContext('2d');
    contextRef.current = ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sprint 15: Apply camera transform (save/restore pattern)
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Redraw all strokes
    sessionState.strokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width / camera.zoom;
      ctx.beginPath();
      
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    });

    // Redraw shapes with sprint 18 shape recognition
    sessionState.shapes.forEach(shape => {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width / camera.zoom;
      
      if (shape.type === 'line' && shape.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        ctx.stroke();
      } else if (shape.type === 'rectangle') {
        if (shape.bounds) {
          // Use snapped bounds from shape recognition
          ctx.strokeRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height);
        } else if (shape.points.length === 2) {
          // Fallback to manual bounds
          const x = Math.min(shape.points[0].x, shape.points[1].x);
          const y = Math.min(shape.points[0].y, shape.points[1].y);
          const w = Math.abs(shape.points[1].x - shape.points[0].x);
          const h = Math.abs(shape.points[1].y - shape.points[0].y);
          ctx.strokeRect(x, y, w, h);
        }
      } else if (shape.type === 'circle') {
        if (shape.bounds) {
          // Use snapped circle from shape recognition
          const { center, radius } = shape.bounds;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (shape.points.length === 2) {
          // Fallback to manual circle
          const x = shape.points[0].x;
          const y = shape.points[0].y;
          const dx = shape.points[1].x - x;
          const dy = shape.points[1].y - y;
          const radius = Math.sqrt(dx * dx + dy * dy);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    });

    // Draw text boxes
    sessionState.textBoxes.forEach(textBox => {
      ctx.fillStyle = textBox.color;
      ctx.font = '16px Arial';
      ctx.fillText(textBox.text, textBox.x, textBox.y);
    });

    ctx.restore();

  }, [sessionState.strokes, sessionState.shapes, sessionState.textBoxes, camera]);

  const handleMouseDown = (e) => {
    if (!canDraw) {
      e.preventDefault();
      return;
    }

    // Sprint 13-14: Spacebar panning
    if (e.button === 1 || (isDraggingCanvas && e.button === 0)) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - camera.x) / camera.zoom;
      const y = (e.clientY - rect.top - camera.y) / camera.zoom;
      const text = prompt('Enter text:');
      if (text) {
        socket?.emit('text-add', { text, x, y, color });
      }
      return;
    }

    setIsDrawing(true);
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

    // Sprint 13-14: Handle canvas panning
    if (isDraggingCanvas && dragStart) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const newCamera = {
        x: camera.x + deltaX,
        y: camera.y + deltaY,
        zoom: camera.zoom,
        timestamp: Date.now()
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
      
      // Redraw for live preview
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(
        window.currentStroke[window.currentStroke.length - 2].x + camera.x,
        window.currentStroke[window.currentStroke.length - 2].y + camera.y
      );
      ctx.lineTo(x + camera.x, y + camera.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = (e) => {
    if (!canDraw) return;

    setIsDraggingCanvas(false);

    if (!isDrawing) return;
    setIsDrawing(false);

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - camera.x) / camera.zoom;
    const y = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (tool === 'pencil' && window.currentStroke && window.currentStroke.length > 1) {
      socket?.emit('stroke-draw', {
        points: window.currentStroke,
        color,
        width: lineWidth
      });
      window.currentStroke = null;
    } else if (window.shapeStart) {
      const points = [window.shapeStart, { x, y }];
      
      // Sprint 18: Shape recognition
      socket?.emit('shape-draw', {
        type: tool,
        points,
        color,
        width: lineWidth
      });
      
      window.shapeStart = null;
      window.shapePoints = null;
    }
  };

  // Sprint 13-14: Wheel zoom (Ctrl + scroll)
  const handleWheel = (e) => {
    if ((e.ctrlKey || e.metaKey) && canDraw) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = camera.zoom * zoomFactor;
      
      // Clamp zoom between 0.5 and 3
      const clampedZoom = Math.max(0.5, Math.min(3, newZoom));
      
      const newCamera = {
        x: camera.x,
        y: camera.y,
        zoom: clampedZoom,
        timestamp: Date.now()
      };
      setCamera(newCamera);
      socket?.emit('camera-change', newCamera);
    }
  };

  return (
    <div className="canvas-container">
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

        {/* Sprint 13-14: Zoom info */}
        <div className="tool-group">
          <span className="zoom-info" title="Ctrl+Scroll to zoom, Middle-click to pan">
            🔍 {(camera.zoom * 100).toFixed(0)}%
          </span>
        </div>

        {/* Role indicator */}
        <div className="tool-group">
          <span className={`role-indicator role-${userRole}`}>
            {userRole === 'viewer' ? '👁️ View Only' : userRole === 'admin' ? '👑 Admin' : '✏️ Editor'}
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
        style={{ cursor: isDraggingCanvas ? 'grab' : tool === 'pencil' ? 'crosshair' : 'default' }}
      />

      {!canDraw && (
        <div className="view-only-overlay">
          <div className="overlay-message">👁️ View Only Mode</div>
        </div>
      )}
    </div>
  );
}
