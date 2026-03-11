import { useState, useEffect } from 'react';
import { recognizeShape, simplifyStroke } from '../utils/shapeRecognition';
import './AICompletion.css';

/**
 * AICompletion - Intelligent shape completion suggestions
 * Analyzes rough sketches and suggests clean shape conversions
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.currentStroke - Current stroke points being drawn
 * @param {Function} props.onAcceptSuggestion - Callback when user accepts suggestion
 * @param {boolean} props.isDrawing - Whether user is actively drawing
 * @returns {React.ReactElement}
 */
export default function AICompletion({ currentStroke, onAcceptSuggestion, isDrawing }) {
  const [suggestion, setSuggestion] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [showSuggestion, setShowSuggestion] = useState(false);

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
    } else {
      setSuggestion(null);
      setShowSuggestion(false);
    }
  }, [currentStroke, isDrawing]);

  /**
   * Handle suggestion acceptance
   */
  const handleAcceptSuggestion = () => {
    if (suggestion) {
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
    setShowSuggestion(false);
  };

  if (!showSuggestion || !suggestion) {
    return null;
  }

  const shapeEmoji = {
    rectangle: '⬜',
    circle: '⚫',
    triangle: '🔺',
    diamond: '💠',
    line: '📏',
    arrow: '➤'
  };

  return (
    <div className="ai-completion-suggestion">
      <div className="suggestion-content">
        <div className="suggestion-icon">
          {shapeEmoji[suggestion.shape] || '✨'}
        </div>
        
        <div className="suggestion-text">
          <div className="suggestion-title">
            Convert to {formatShapeName(suggestion.shape)}?
          </div>
          <div className="suggestion-confidence">
            Confidence: {(confidence * 100).toFixed(0)}%
          </div>
        </div>

        <div className="suggestion-actions">
          <button
            className="suggestion-accept"
            onClick={handleAcceptSuggestion}
            title="Accept suggestion (Y)"
          >
            ✓ Accept
          </button>
          <button
            className="suggestion-dismiss"
            onClick={handleDismiss}
            title="Dismiss (N)"
          >
            ✕ Cancel
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
