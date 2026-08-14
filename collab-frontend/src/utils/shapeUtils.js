/**
 * Shape utilities for intelligent shape management and auto-connectors
 * Provides shape creation, recognition, and connection logic
 */

/**
 * Shape types supported by the smart shapes system
 */
export const SHAPE_TYPES = {
  // Basic shapes
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  OVAL: 'oval',
  DIAMOND: 'diamond',
  TRIANGLE: 'triangle',
  LINE: 'line',
  
  // Flowchart shapes
  PROCESS: 'process',      // Rectangle (action/process)
  DECISION: 'decision',    // Diamond (choice/conditional)
  TERMINAL: 'terminal',    // Oval (start/end)
  DOCUMENT: 'document',    // Document symbol
  DATABASE: 'database',    // Cylinder
  DISPLAY: 'display',      // Curved rectangle
  
  // UML shapes
  CLASS: 'class',          // Class box with sections
  INTERFACE: 'interface',  // Interface box
  ACTOR: 'actor',          // Stick figure
  
  // Other shapes
  HEXAGON: 'hexagon',
  PENTAGON: 'pentagon',
  ARROW: 'arrow'
};

/**
 * Shape configuration with rendering info
 */
export const SHAPE_CONFIG = {
  [SHAPE_TYPES.RECTANGLE]: {
    name: 'Rectangle',
    category: 'flowchart',
    icon: '▢',
    connectorPoints: 4, // North, South, East, West
    draw: drawRectangle,
    defaultWidth: 100,
    defaultHeight: 60
  },
  [SHAPE_TYPES.CIRCLE]: {
    name: 'Circle',
    category: 'basic',
    icon: '○',
    connectorPoints: 8,
    draw: drawCircle,
    defaultWidth: 80,
    defaultHeight: 80
  },
  [SHAPE_TYPES.OVAL]: {
    name: 'Oval',
    category: 'flowchart',
    icon: '○',
    connectorPoints: 4,
    draw: drawOval,
    defaultWidth: 100,
    defaultHeight: 60
  },
  [SHAPE_TYPES.DIAMOND]: {
    name: 'Diamond',
    category: 'flowchart',
    icon: '◇',
    connectorPoints: 4,
    draw: drawDiamond,
    defaultWidth: 120,
    defaultHeight: 100
  },
  [SHAPE_TYPES.TRIANGLE]: {
    name: 'Triangle',
    category: 'basic',
    icon: '△',
    connectorPoints: 3,
    draw: drawTriangle,
    defaultWidth: 100,
    defaultHeight: 100
  },
  [SHAPE_TYPES.DATABASE]: {
    name: 'Database',
    category: 'flowchart',
    icon: '[db]',
    connectorPoints: 4,
    draw: drawDatabase,
    defaultWidth: 100,
    defaultHeight: 80
  },
  [SHAPE_TYPES.DOCUMENT]: {
    name: 'Document',
    category: 'flowchart',
    icon: '[d]',
    connectorPoints: 4,
    draw: drawDocument,
    defaultWidth: 100,
    defaultHeight: 80
  }
};

/**
 * Drawing functions for each shape type
 */

function drawRectangle(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, width, height);
}

function drawCircle(ctx, x, y, width, height, color, lineWidth = 2) {
  const radius = Math.min(width, height) / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawOval(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDiamond(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);                    // Top
  ctx.lineTo(x + width, y + height / 2);           // Right
  ctx.lineTo(x + width / 2, y + height);           // Bottom
  ctx.lineTo(x, y + height / 2);                   // Left
  ctx.closePath();
  ctx.stroke();
}

function drawTriangle(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);                    // Top
  ctx.lineTo(x + width, y + height);               // Bottom right
  ctx.lineTo(x, y + height);                       // Bottom left
  ctx.closePath();
  ctx.stroke();
}

function drawDatabase(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  const cylinderTopHeight = height * 0.3;
  
  // Top ellipse
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + cylinderTopHeight, width / 2, cylinderTopHeight / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  
  // Body rectangle
  ctx.strokeRect(x, y + cylinderTopHeight, width, height - cylinderTopHeight * 2);
  
  // Bottom ellipse
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height - cylinderTopHeight, width / 2, cylinderTopHeight / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDocument(ctx, x, y, width, height, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  
  // Main rectangle
  ctx.strokeRect(x, y, width, height * 0.8);
  
  // Bottom curve
  ctx.beginPath();
  ctx.moveTo(x, y + height * 0.8);
  ctx.quadraticCurveTo(x + width / 2, y + height, x + width, y + height * 0.8);
  ctx.stroke();
}

/**
 * Get connector points for a shape (where connections can attach)
 * @param {Object} shape - Shape object with x, y, width, height
 * @param {string} shapeType - Type of shape
 * @returns {Array} Array of { x, y, side } connector points
 */
export function getConnectorPoints(shape, shapeType = SHAPE_TYPES.RECTANGLE) {
  const { x, y, width, height } = shape;
  const points = [];
  
  switch (shapeType) {
    case SHAPE_TYPES.RECTANGLE:
    case SHAPE_TYPES.PROCESS:
      // 4 points: N, S, E, W
      points.push(
        { x: x + width / 2, y: y, side: 'north' },
        { x: x + width / 2, y: y + height, side: 'south' },
        { x: x + width, y: y + height / 2, side: 'east' },
        { x: x, y: y + height / 2, side: 'west' }
      );
      break;
      
    case SHAPE_TYPES.CIRCLE:
    case SHAPE_TYPES.OVAL:
      // 8 points for circular shapes
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      const radius = Math.max(width, height) / 2;
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      
      angles.forEach((angle) => {
        const rad = (angle * Math.PI) / 180;
        points.push({
          x: centerX + radius * Math.cos(rad),
          y: centerY + radius * Math.sin(rad),
          side: getDegreeDirection(angle)
        });
      });
      break;
      
    case SHAPE_TYPES.DIAMOND:
      // 4 points at diamond vertices
      points.push(
        { x: x + width / 2, y: y, side: 'north' },
        { x: x + width, y: y + height / 2, side: 'east' },
        { x: x + width / 2, y: y + height, side: 'south' },
        { x: x, y: y + height / 2, side: 'west' }
      );
      break;
      
    default:
      // Default: 4 cardinal points
      points.push(
        { x: x + width / 2, y: y, side: 'north' },
        { x: x + width / 2, y: y + height, side: 'south' },
        { x: x + width, y: y + height / 2, side: 'east' },
        { x: x, y: y + height / 2, side: 'west' }
      );
  }
  
  return points;
}

/**
 * Find closest connector point on a shape to a given coordinate
 * @param {Object} shape - Shape object
 * @param {number} targetX - Target x coordinate
 * @param {number} targetY - Target y coordinate
 * @param {string} shapeType - Type of shape
 * @returns {Object} Closest connector point
 */
export function getClosestConnectorPoint(shape, targetX, targetY, shapeType = SHAPE_TYPES.RECTANGLE) {
  const points = getConnectorPoints(shape, shapeType);
  let closest = points[0];
  let minDistance = Infinity;
  
  points.forEach(point => {
    const distance = Math.sqrt(
      Math.pow(point.x - targetX, 2) + Math.pow(point.y - targetY, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = point;
    }
  });
  
  return closest;
}

/**
 * Create auto-connector between two shapes
 * @param {Object} sourceShape - Source shape
 * @param {Object} targetShape - Target shape
 * @param {Object} options - Options for connector
 * @returns {Object} Connector object
 */
export function createAutoConnector(sourceShape, targetShape, options = {}) {
  const sourcePoint = getClosestConnectorPoint(
    sourceShape,
    targetShape.x + targetShape.width / 2,
    targetShape.y + targetShape.height / 2
  );
  
  const targetPoint = getClosestConnectorPoint(
    targetShape,
    sourceShape.x + sourceShape.width / 2,
    sourceShape.y + sourceShape.height / 2
  );
  
  return {
    id: `connector-${Date.now()}`,
    from: sourceShape.id,
    to: targetShape.id,
    fromPoint: sourcePoint,
    toPoint: targetPoint,
    style: options.style || 'line', // 'line', 'curve', 'orthogonal'
    label: options.label || '',
    color: options.color || '#333333',
    width: options.width || 2,
    ...options
  };
}

/**
 * Draw connector path between two points
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} from - Source point { x, y }
 * @param {Object} to - Target point { x, y }
 * @param {string} style - Connector style ('line', 'curve', 'orthogonal')
 * @param {string} color - Connector color
 * @param {number} width - Connector width
 */
export function drawConnector(ctx, from, to, style = 'line', color = '#333333', width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  
  ctx.beginPath();
  
  switch (style) {
    case 'curve':
      // Quadratic bezier curve
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(midX, midY + 50, to.x, to.y);
      break;
      
    case 'orthogonal':
      // Right-angle orthogonal connector
      const cornerX = (from.x + to.x) / 2;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(cornerX, from.y);
      ctx.lineTo(cornerX, to.y);
      ctx.lineTo(to.x, to.y);
      break;
      
    case 'line':
    default:
      // Straight line
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
  }
  
  ctx.stroke();
  
  // Draw arrow head
  drawArrowHead(ctx, from, to, color, width);
}

/**
 * Draw arrow head at connector end
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} from - Source point
 * @param {Object} to - Target point
 * @param {string} color - Arrow color
 * @param {number} width - Arrow width
 */
function drawArrowHead(ctx, from, to, color, width) {
  const headlen = 15;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/**
 * Check if point is near a shape (for selection/click detection)
 * @param {number} px - Point x
 * @param {number} py - Point y
 * @param {Object} shape - Shape object
 * @param {number} tolerance - Selection tolerance in pixels
 * @returns {boolean} True if point is near shape
 */
export function isPointNearShape(px, py, shape, tolerance = 5) {
  const { x, y, width, height } = shape;
  
  // Check if point is within bounds + tolerance
  return (
    px >= x - tolerance &&
    px <= x + width + tolerance &&
    py >= y - tolerance &&
    py <= y + height + tolerance
  );
}

/**
 * Get cardinal direction from angle
 * @param {number} angle - Angle in degrees
 * @returns {string} Direction (north, northeast, east, etc.)
 */
function getDegreeDirection(angle) {
  const directions = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
}

/**
 * Snap shape to grid
 * @param {Object} shape - Shape to snap
 * @param {number} gridSize - Grid size in pixels (default 10)
 * @returns {Object} Snapped shape
 */
export function snapToGrid(shape, gridSize = 10) {
  return {
    ...shape,
    x: Math.round(shape.x / gridSize) * gridSize,
    y: Math.round(shape.y / gridSize) * gridSize,
    width: Math.round(shape.width / gridSize) * gridSize,
    height: Math.round(shape.height / gridSize) * gridSize
  };
}
