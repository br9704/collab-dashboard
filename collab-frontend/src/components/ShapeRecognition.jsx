import { useState, useEffect, useRef } from 'react';
import { recognizeShape, simplifyStroke } from '../utils/shapeRecognition';

/**
 * ShapeRecognition - suggests snapping a rough stroke to a clean shape
 * Pure geometric analysis of the stroke points. No model, no inference.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.currentStroke - Current stroke points being drawn
 * @param {Function} props.onAcceptSuggestion - Callback when user accepts suggestion
 * @param {boolean} props.isDrawing - Whether user is actively drawing
 * @returns {React.ReactElement}
 */
/** Below this, the recognition is offered but never applied on its own. */
const AUTO_KEEP_CONFIDENCE = 0.85;

export default function ShapeRecognition({ currentStroke, onAcceptSuggestion, isDrawing }) {
  const [suggestion, setSuggestion] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const acceptedRef = useRef(null);

  /**
   * Analyze stroke when user finishes drawing
   */
  useEffect(() => {
    // Only process when drawing is complete and stroke has enough points
    if (isDrawing || !currentStroke || currentStroke.length < 4) {
      setSuggestion(null);
      setShowSuggestion(false);
      return;
    }

    // Analyze the stroke
    const recognition = recognizeShape(currentStroke);

    if (recognition.shape && recognition.confidence > 0.6) {
      setSuggestion(recognition);
      setConfidence(recognition.confidence);
      setShowSuggestion(true);
      acceptedRef.current = recognition;
    } else {
      setSuggestion(null);
      setShowSuggestion(false);
    }
  }, [currentStroke, isDrawing]);

  /**
   * MOTION.md: "a dismissible chip appears for 3s; ignoring it KEEPS the recognition."
   *
   * Ignoring is the common case, so ignoring has to be the cheap one. Doing nothing accepts
   * the clean shape; dismissing is the deliberate act that keeps the rough stroke.
   *
   * WITH ONE LIMIT. Accepting a recognition REPLACES the stroke, so auto-keeping a marginal
   * guess silently destroys what the user actually drew — which is exactly what happened
   * while recording the demo: a hand-drawn zigzag was swapped for a straight diagonal. Above
   * the confident threshold, doing nothing keeps the clean shape. Below it, doing nothing
   * keeps YOUR stroke, and taking the recognition needs a deliberate click. Silence should
   * never cost you your work.
   */
  useEffect(() => {
    if (!showSuggestion || !suggestion) return;
    const t = setTimeout(() => {
      const pending = acceptedRef.current;
      if (pending && pending.confidence >= AUTO_KEEP_CONFIDENCE) {
        onAcceptSuggestion({
          shape: pending.shape,
          bounds: pending.bounds,
          originalPoints: currentStroke,
        });
      }
      setShowSuggestion(false);
      setSuggestion(null);
    }, 3000);
    return () => clearTimeout(t);
  }, [showSuggestion, suggestion, currentStroke, onAcceptSuggestion]);

  /**
   * Handle suggestion acceptance
   */
  const handleAcceptSuggestion = () => {
    if (suggestion) {
      acceptedRef.current = null;
      onAcceptSuggestion({
        shape: suggestion.shape,
        bounds: suggestion.bounds,
        originalPoints: currentStroke,
        simplified: simplifyStroke(currentStroke)
      });
      setSuggestion(null);
      setShowSuggestion(false);
    }
  };

  /**
   * Dismiss suggestion
   */
  const handleDismiss = () => {
    acceptedRef.current = null;   // cancel the auto-keep
    setShowSuggestion(false);
    setSuggestion(null);
  };

  if (!showSuggestion || !suggestion) {
    return null;
  }

  const shapeEmoji = {
    rectangle: '▢',
    circle: '○',
    triangle: '△',
    diamond: '◇',
    line: '—',
    arrow: '→'
  };

  return (
    <div className="shape-recognition-suggestion">
      <div className="suggestion-content">
        <div className="suggestion-icon">
          {shapeEmoji[suggestion.shape] || '*'}
        </div>
        
        <div className="suggestion-text">
          <div className="suggestion-title">
            looks like a {formatShapeName(suggestion.shape).toLowerCase()} — keep?
          </div>
          <div className="suggestion-confidence">
            {(confidence * 100).toFixed(0)}% · {confidence >= AUTO_KEEP_CONFIDENCE ? 'keeping in 3s' : 'keep to apply'}
          </div>
        </div>

        <div className="suggestion-actions">
          <button
            className="suggestion-accept"
            onClick={handleAcceptSuggestion}
            title="Accept suggestion (Y)"
          >
            keep
          </button>
          <button
            className="suggestion-dismiss"
            onClick={handleDismiss}
            title="Dismiss (N)"
          >
            undo
          </button>
        </div>
      </div>

      <div className="suggestion-bar" style={{
        width: `${confidence * 100}%`,
        background: getConfidenceColor(confidence)
      }}></div>
    </div>
  );
}

/**
 * Format shape name for display
 */
function formatShapeName(shape) {
  const names = {
    rectangle: 'Rectangle',
    circle: 'Circle',
    triangle: 'Triangle',
    diamond: 'Diamond',
    line: 'Line',
    arrow: 'Arrow'
  };
  return names[shape] || shape;
}

/**
 * Get color based on confidence level
 */
function getConfidenceColor(confidence) {
  if (confidence >= 0.9) return '#374151';      // Dark grey
  if (confidence >= 0.8) return '#4b5563';      // Medium-dark grey
  if (confidence >= 0.7) return '#6b7280';      // Medium grey
  if (confidence >= 0.6) return '#9ca3af';      // Light grey
  return '#d1d5db';                             // Lightest grey
}
