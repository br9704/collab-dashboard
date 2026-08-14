import { useState } from 'react';
import { SHAPE_CONFIG, SHAPE_TYPES } from '../utils/shapeUtils';

/**
 * SmartShapes - Toolbar for selecting and creating smart shapes
 * Features intelligent shape creation with auto-connectors
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onShapeSelected - Callback when shape is selected
 * @param {string} props.selectedShape - Currently selected shape type
 * @returns {React.ReactElement}
 */
export default function SmartShapes({ onShapeSelected, selectedShape }) {
  const [expandedCategory, setExpandedCategory] = useState('flowchart');
  const [showConnectorOptions, setShowConnectorOptions] = useState(false);
  const [connectorStyle, setConnectorStyle] = useState('line');

  /**
   * Group shapes by category
   */
  const shapesByCategory = Object.entries(SHAPE_CONFIG).reduce((acc, [type, config]) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push({ type, ...config });
    return acc;
  }, {});

  /**
   * Handle shape selection
   */
  const handleShapeSelect = (shapeType) => {
    onShapeSelected({
      type: shapeType,
      connectorStyle: connectorStyle
    });
  };

  return (
    <div className="smart-shapes-panel">
      <div className="smart-shapes-header">
        <h3>Smart Shapes</h3>
        <span className="smart-shapes-info">Click to select shape</span>
      </div>

      {/* Shape categories */}
      {Object.entries(shapesByCategory).map(([category, shapes]) => (
        <div key={category} className="shape-category">
          <button
            className={`category-toggle ${expandedCategory === category ? 'expanded' : ''}`}
            onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
          >
            <span className="toggle-arrow">▸</span>
            <span className="category-name">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </span>
            <span className="shape-count">({shapes.length})</span>
          </button>

          {expandedCategory === category && (
            <div className="shape-grid">
              {shapes.map((shape) => (
                <button
                  key={shape.type}
                  className={`shape-button ${selectedShape === shape.type ? 'selected' : ''}`}
                  onClick={() => handleShapeSelect(shape.type)}
                  title={shape.name}
                >
                  <span className="shape-icon">{shape.icon}</span>
                  <span className="shape-name">{shape.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Connector options */}
      <div className="connector-options">
        <button
          className={`connector-toggle ${showConnectorOptions ? 'expanded' : ''}`}
          onClick={() => setShowConnectorOptions(!showConnectorOptions)}
        >
          <span className="toggle-arrow">▸</span>
          <span>Connector Style</span>
        </button>

        {showConnectorOptions && (
          <div className="connector-style-group">
            {[
              { value: 'line', label: '→ Straight', icon: '→' },
              { value: 'curve', label: '↗ Curved', icon: '⤴' },
              { value: 'orthogonal', label: '⊣ Orthogonal', icon: '⊠' }
            ].map((option) => (
              <label key={option.value} className="connector-option">
                <input
                  type="radio"
                  name="connector-style"
                  value={option.value}
                  checked={connectorStyle === option.value}
                  onChange={(e) => setConnectorStyle(e.target.value)}
                />
                <span>{option.icon} {option.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Quick tips */}
      <div className="smart-shapes-tips">
        <div className="tips-header">> Quick Tips</div>
        <ul className="tips-list">
          <li>Select a shape and click on canvas to create</li>
          <li>Connect shapes by dragging between them</li>
          <li>Hold Shift while dragging to auto-connect</li>
          <li>Double-click shapes to add labels</li>
        </ul>
      </div>
    </div>
  );
}
