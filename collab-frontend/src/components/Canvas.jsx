import { useEffect, useRef, useState } from 'react';
import './Canvas.css';

export default function Canvas({ socket, sessionState, currentUserId }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Redraw all existing strokes and shapes
    sessionState.strokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
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

    // Redraw shapes
    sessionState.shapes.forEach(shape => {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      
      if (shape.type === 'line' && shape.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        ctx.stroke();
      } else if (shape.type === 'rectangle' && shape.points.length === 2) {
        const x = Math.min(shape.points[0].x, shape.points[1].x);
        const y = Math.min(shape.points[0].y, shape.points[1].y);
        const w = Math.abs(shape.points[1].x - shape.points[0].x);
        const h = Math.abs(shape.points[1].y - shape.points[0].y);
        ctx.strokeRect(x, y, w, h);
      } else if (shape.type === 'circle' && shape.points.length === 2) {
        const x = shape.points[0].x;
        const y = shape.points[0].y;
        const dx = shape.points[1].x - x;
        const dy = shape.points[1].y - y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // Draw text boxes
    sessionState.textBoxes.forEach(textBox => {
      ctx.fillStyle = textBox.color;
      ctx.font = '16px Arial';
      ctx.fillText(textBox.text, textBox.x, textBox.y);
    });
  }, [sessionState.strokes, sessionState.shapes, sessionState.textBoxes]);

  const handleMouseDown = (e) => {
    if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const text = prompt('Enter text:');
      if (text) {
        sessionState.addText(text, x, y, color);
      }
      return;
    }

    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (tool === 'pencil') {
      window.currentStroke = [{ x, y }];
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      window.shapeStart = { x, y };
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Send cursor position
    socket?.emit('cursor-move', { x, y });

    if (!isDrawing) return;

    if (tool === 'pencil' && window.currentStroke) {
      window.currentStroke.push({ x, y });

      // Draw locally
      const ctx = canvasRef.current.getContext('2d');
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const prev = window.currentStroke[window.currentStroke.length - 2];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'pencil' && window.currentStroke) {
      sessionState.drawStroke(window.currentStroke, color, lineWidth);
      window.currentStroke = null;
    } else if (window.shapeStart) {
      const points = [window.shapeStart, { x, y }];
      sessionState.drawShape(tool, points, color, lineWidth);
      window.shapeStart = null;
    }
  };

  const handleToolChange = (newTool) => {
    setTool(newTool);
    sessionState.changeTool(newTool);
  };

  return (
    <div className="canvas-container">
      <div className="toolbar">
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === 'pencil' ? 'active' : ''}`}
            onClick={() => handleToolChange('pencil')}
            title="Pencil (free draw)"
          >
            ✏️ Pencil
          </button>
          <button
            className={`tool-btn ${tool === 'line' ? 'active' : ''}`}
            onClick={() => handleToolChange('line')}
            title="Line"
          >
            📍 Line
          </button>
          <button
            className={`tool-btn ${tool === 'rectangle' ? 'active' : ''}`}
            onClick={() => handleToolChange('rectangle')}
            title="Rectangle"
          >
            ▭ Rectangle
          </button>
          <button
            className={`tool-btn ${tool === 'circle' ? 'active' : ''}`}
            onClick={() => handleToolChange('circle')}
            title="Circle"
          >
            ◯ Circle
          </button>
          <button
            className={`tool-btn ${tool === 'text' ? 'active' : ''}`}
            onClick={() => handleToolChange('text')}
            title="Text"
          >
            A Text
          </button>
        </div>

        <div className="tool-group">
          <label htmlFor="color" className="label">Color:</label>
          <input
            type="color"
            id="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="color-picker"
          />
        </div>

        <div className="tool-group">
          <label htmlFor="lineWidth" className="label">Width:</label>
          <input
            type="range"
            id="lineWidth"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="slider"
          />
          <span className="value">{lineWidth}px</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight - 80}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="canvas"
      />
    </div>
  );
}
