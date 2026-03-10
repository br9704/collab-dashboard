/**
 * Shape recognition and AI completion engine
 * Analyzes rough sketches and auto-completes them into clean shapes
 */

/**
 * Recognize shape from stroke points
 * Uses heuristics to identify what shape user is drawing
 * 
 * @param {Array} points - Array of { x, y } coordinates from stroke
 * @returns {Object} Recognition result { shape, confidence, bounds }
 */
export function recognizeShape(points) {
  if (!points || points.length < 4) {
    return { shape: null, confidence: 0 };
  }

  // Calculate shape features
  const features = analyzeStroke(points);
  
  // Try to match against known shapes
  const candidates = [
    tryRectangle(features, points),
    tryCircle(features, points),
    tryTriangle(features, points),
    tryLine(features, points),
    tryDiamond(features, points),
    tryArrow(features, points)
  ].filter(c => c && c.confidence > 0.5);

  // Return highest confidence match
  if (candidates.length === 0) {
    return { shape: null, confidence: 0 };
  }

  return candidates.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
}

/**
 * Analyze stroke characteristics
 * @param {Array} points - Stroke points
 * @returns {Object} Analyzed features
 */
function analyzeStroke(points) {
  const bounds = getBounds(points);
  const area = bounds.width * bounds.height;
  const perimeter = calculatePerimeter(points);
  const closure = calculateClosure(points);
  const convexity = calculateConvexity(points);
  const corners = detectCorners(points);
  const linearity = calculateLinearity(points);

  return {
    bounds,
    area,
    perimeter,
    closure,      // How much sketch returns to start (0-1)
    convexity,    // How convex the shape is (0-1)
    corners,      // Detected corner points
    linearity,    // How linear segments are (0-1)
    aspectRatio: bounds.width / bounds.height
  };
}

/**
 * Calculate bounding box
 */
function getBounds(points) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Calculate perimeter from stroke
 */
function calculatePerimeter(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    distance += Math.sqrt(dx * dx + dy * dy);
  }
  return distance;
}

/**
 * Calculate closure ratio (how much path returns to start)
 */
function calculateClosure(points) {
  if (points.length < 2) return 0;
  
  const dx = points[points.length - 1].x - points[0].x;
  const dy = points[points.length - 1].y - points[0].y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const maxDistance = Math.max(...points.map((p, i, arr) => {
    if (i === 0) return 0;
    const d = Math.sqrt(Math.pow(p.x - arr[0].x, 2) + Math.pow(p.y - arr[0].y, 2));
    return d;
  }));

  return 1 - Math.min(1, distance / (maxDistance + 1));
}

/**
 * Detect corners in the stroke
 */
function detectCorners(points) {
  const corners = [];
  const threshold = 25; // Minimum angle for corner (degrees)

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];

    const angle = getAngle(p1, p2, p3);
    if (Math.abs(angle) > threshold) {
      corners.push({ point: p2, index: i, angle });
    }
  }

  return corners;
}

/**
 * Calculate angle between three points (in degrees)
 */
function getAngle(p1, p2, p3) {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const det = v1.x * v2.y - v1.y * v2.x;
  const angle = Math.atan2(det, dot);

  return (angle * 180) / Math.PI;
}

/**
 * Calculate linearity of stroke segments
 */
function calculateLinearity(points) {
  if (points.length < 3) return 1;

  let deviations = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];

    // Distance from p2 to line p1-p3
    const lineLength = Math.sqrt(
      Math.pow(p3.x - p1.x, 2) + Math.pow(p3.y - p1.y, 2)
    );

    if (lineLength === 0) continue;

    const distance = Math.abs(
      (p3.y - p1.y) * p2.x - (p3.x - p1.x) * p2.y + p3.x * p1.y - p3.y * p1.x
    ) / lineLength;

    deviations += distance;
  }

  const avgDeviation = deviations / (points.length - 2);
  return Math.max(0, 1 - avgDeviation / 100);
}

/**
 * Calculate convexity (how close to convex hull)
 */
function calculateConvexity(points) {
  if (points.length < 3) return 1;

  const area = calculatePolygonArea(points);
  const hull = getConvexHull(points);
  const hullArea = calculatePolygonArea(hull);

  return hullArea > 0 ? area / hullArea : 0;
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Get convex hull of points (Graham scan)
 */
function getConvexHull(points) {
  if (points.length < 3) return points;

  // Sort points by x coordinate
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  // Build lower hull
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2) {
      const o = lower[lower.length - 2];
      const a = lower[lower.length - 1];
      const b = sorted[i];
      if (crossProduct(o, a, b) <= 0) {
        lower.pop();
      } else {
        break;
      }
    }
    lower.push(sorted[i]);
  }

  // Build upper hull
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2) {
      const o = upper[upper.length - 2];
      const a = upper[upper.length - 1];
      const b = sorted[i];
      if (crossProduct(o, a, b) <= 0) {
        upper.pop();
      } else {
        break;
      }
    }
    upper.push(sorted[i]);
  }

  // Remove last point of each half because it's the same as the first point of the other
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/**
 * Cross product of vectors OA and OB
 */
function crossProduct(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Try to match as rectangle
 */
function tryRectangle(features, points) {
  const { bounds, corners, closure } = features;

  // Look for 4 corners
  if (corners.length < 3 || corners.length > 5) return null;

  // Should be closed
  if (closure < 0.7) return null;

  // Calculate corner positions and check if they form rectangle
  const sortedCorners = corners.sort((a, b) => a.index - b.index);
  let confidence = 0.85;

  // Penalize if not axis-aligned
  if (Math.abs(bounds.width - bounds.height) > bounds.width * 0.3) {
    confidence -= 0.1;
  }

  return {
    shape: 'rectangle',
    confidence: Math.max(0.5, confidence),
    bounds
  };
}

/**
 * Try to match as circle
 */
function tryCircle(features, points) {
  const { bounds, closure, convexity } = features;

  // Should be closed and convex
  if (closure < 0.7) return null;
  if (convexity < 0.8) return null;

  // Check aspect ratio (should be close to 1.0 for circle)
  const { aspectRatio } = features;
  const aspectScore = Math.max(0, 1 - Math.abs(aspectRatio - 1) * 0.5);

  const confidence = 0.8 * closure * convexity * aspectScore;

  return {
    shape: 'circle',
    confidence: Math.max(0.5, confidence),
    bounds
  };
}

/**
 * Try to match as triangle
 */
function tryTriangle(features, points) {
  const { corners, closure } = features;

  // Look for exactly 3 corners
  if (corners.length < 2 || corners.length > 4) return null;
  if (closure < 0.7) return null;

  return {
    shape: 'triangle',
    confidence: 0.8,
    bounds: features.bounds
  };
}

/**
 * Try to match as line
 */
function tryLine(features, points) {
  const { linearity, closure } = features;

  // Should not be closed
  if (closure > 0.3) return null;

  // Should be linear
  if (linearity < 0.7) return null;

  return {
    shape: 'line',
    confidence: 0.9 * linearity,
    bounds: features.bounds
  };
}

/**
 * Try to match as diamond
 */
function tryDiamond(features, points) {
  const { corners, closure, bounds } = features;

  // Look for 4 corners
  if (corners.length < 3 || corners.length > 5) return null;
  if (closure < 0.7) return null;

  // Should have roughly equal aspect ratio
  const aspectRatio = bounds.width / bounds.height;
  const aspectScore = Math.max(0, 1 - Math.abs(aspectRatio - 1) * 0.3);

  return {
    shape: 'diamond',
    confidence: 0.75 * aspectScore,
    bounds
  };
}

/**
 * Try to match as arrow
 */
function tryArrow(features, points) {
  const { linearity, corners } = features;

  // Should be relatively linear with some corners
  if (linearity < 0.6) return null;
  if (corners.length < 1 || corners.length > 3) return null;

  return {
    shape: 'arrow',
    confidence: 0.7,
    bounds: features.bounds
  };
}

/**
 * Clean up and smooth stroke points
 * @param {Array} points - Raw stroke points
 * @param {number} tolerance - Simplification tolerance
 * @returns {Array} Simplified points
 */
export function simplifyStroke(points, tolerance = 2) {
  if (points.length < 3) return points;

  // Use Douglas-Peucker algorithm
  return douglasPeucker(points, tolerance);
}

/**
 * Douglas-Peucker line simplification algorithm
 */
function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i], points[0], points[points.length - 1]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > tolerance) {
    const rec1 = douglasPeucker(points.slice(0, index + 1), tolerance);
    const rec2 = douglasPeucker(points.slice(index), tolerance);
    return rec1.slice(0, -1).concat(rec2);
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Calculate distance from point to line
 */
function pointToLineDistance(point, lineStart, lineEnd) {
  const numerator = Math.abs(
    (lineEnd.y - lineStart.y) * point.x -
    (lineEnd.x - lineStart.x) * point.y +
    lineEnd.x * lineStart.y -
    lineEnd.y * lineStart.x
  );

  const denominator = Math.sqrt(
    Math.pow(lineEnd.y - lineStart.y, 2) +
    Math.pow(lineEnd.x - lineStart.x, 2)
  );

  return numerator / denominator;
}
