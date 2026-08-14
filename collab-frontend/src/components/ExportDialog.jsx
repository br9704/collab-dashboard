import { useState } from 'react';

/**
 * ExportDialog — modal dialog for exporting the canvas as PNG, SVG, or JSON.
 * Renders the current canvas state to the selected format and triggers download.
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen     - Whether the dialog is visible
 * @param {Function} props.onClose    - Called when dialog is dismissed
 * @param {Object}   props.canvasRef  - Ref to the HTML canvas element
 * @param {Object}   props.sessionState - Current session state for JSON export
 */
export default function ExportDialog({ 
  isOpen, 
  onClose, 
  onExport,
  canvasRef,
  sessionState
}) {
  const [exportFormat, setExportFormat] = useState('png');
  const [isExporting, setIsExporting] = useState(false);
  const [fileName, setFileName] = useState('collab-drawing');

  const handleExportClick = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'png') {
        exportPNG();
      } else if (exportFormat === 'svg') {
        exportSVG();
      }
      onExport();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a new canvas with the same dimensions
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    
    const ctx = exportCanvas.getContext('2d');
    
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Draw the current canvas content
    ctx.drawImage(canvas, 0, 0);
    
    // Convert to PNG and download
    exportCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const exportSVG = () => {
    const { strokes = [], shapes = [], textBoxes = [] } = sessionState || {};
    
    // Start SVG document
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    
    // Set viewBox and dimensions (A4-like aspect ratio)
    const width = 1200;
    const height = 800;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('xmlns', svgNS);
    
    // Add white background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    
    // Add strokes
    strokes.forEach((stroke) => {
      if (stroke.points && stroke.points.length > 1) {
        const path = document.createElementNS(svgNS, 'path');
        let pathData = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
        
        for (let i = 1; i < stroke.points.length; i++) {
          pathData += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
        }
        
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', stroke.color || '#000000');
        path.setAttribute('stroke-width', stroke.width || 2);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
      }
    });
    
    // Add shapes
    shapes.forEach((shape) => {
      if (shape.type === 'line' && shape.points.length === 2) {
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', shape.points[0].x);
        line.setAttribute('y1', shape.points[0].y);
        line.setAttribute('x2', shape.points[1].x);
        line.setAttribute('y2', shape.points[1].y);
        line.setAttribute('stroke', shape.color || '#000000');
        line.setAttribute('stroke-width', shape.width || 2);
        svg.appendChild(line);
      } else if (shape.type === 'rectangle' && shape.bounds) {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', shape.bounds.x);
        rect.setAttribute('y', shape.bounds.y);
        rect.setAttribute('width', shape.bounds.width);
        rect.setAttribute('height', shape.bounds.height);
        rect.setAttribute('stroke', shape.color || '#000000');
        rect.setAttribute('stroke-width', shape.width || 2);
        rect.setAttribute('fill', 'none');
        svg.appendChild(rect);
      } else if (shape.type === 'circle' && shape.bounds) {
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', shape.bounds.center.x);
        circle.setAttribute('cy', shape.bounds.center.y);
        circle.setAttribute('r', shape.bounds.radius);
        circle.setAttribute('stroke', shape.color || '#000000');
        circle.setAttribute('stroke-width', shape.width || 2);
        circle.setAttribute('fill', 'none');
        svg.appendChild(circle);
      }
    });
    
    // Add text boxes
    textBoxes.forEach((textBox) => {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', textBox.x);
      text.setAttribute('y', textBox.y);
      text.setAttribute('fill', textBox.color || '#000000');
      text.setAttribute('font-size', textBox.fontSize || '16');
      text.setAttribute('font-family', 'Arial, sans-serif');
      
      // Apply formatting if available
      if (textBox.formatting) {
        if (textBox.formatting.bold) {
          text.setAttribute('font-weight', 'bold');
        }
        if (textBox.formatting.italic) {
          text.setAttribute('font-style', 'italic');
        }
        if (textBox.formatting.underline) {
          text.setAttribute('text-decoration', 'underline');
        }
        if (textBox.formatting.strikethrough) {
          text.setAttribute('text-decoration', 'line-through');
        }
      }
      
      text.textContent = textBox.text;
      svg.appendChild(text);
    });
    
    // Convert to string and download
    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="export-dialog-overlay">
      <div className="export-dialog">
        <div className="export-header">
          <h2>Export Drawing</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="export-content">
          <div className="format-selector">
            <label className="format-option">
              <input
                type="radio"
                name="format"
                value="png"
                checked={exportFormat === 'png'}
                onChange={(e) => setExportFormat(e.target.value)}
              />
              <span className="format-label">PNG (Image)</span>
              <span className="format-desc">High quality image suitable for sharing</span>
            </label>

            <label className="format-option">
              <input
                type="radio"
                name="format"
                value="svg"
                checked={exportFormat === 'svg'}
                onChange={(e) => setExportFormat(e.target.value)}
              />
              <span className="format-label">SVG (Vector)</span>
              <span className="format-desc">Scalable vector format, editable in design tools</span>
            </label>
          </div>

          <div className="file-name-input">
            <label htmlFor="fileName">File Name:</label>
            <input
              id="fileName"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="collab-drawing"
              maxLength={50}
            />
            <span className="file-ext">.{exportFormat}</span>
          </div>
        </div>

        <div className="export-footer">
          <button
            className="export-cancel-button"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            className="export-button"
            onClick={handleExportClick}
            disabled={isExporting || !fileName.trim()}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
