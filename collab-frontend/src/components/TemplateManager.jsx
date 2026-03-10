import { useState } from 'react';
import { getAvailableTemplates, getTemplatesByCategory, createCanvasFromTemplate } from '../data/templates';
import './TemplateManager.css';

/**
 * TemplateManager - UI component for selecting and loading pre-made templates
 * Allows users to start a new whiteboard with predefined shapes and layouts
 * 
 * Features:
 * - Browse templates by category (flowchart, kanban, wireframe, diagram)
 * - Preview template layout
 * - Load template into canvas
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onLoadTemplate - Callback when template is selected
 * @param {boolean} props.isOpen - Dialog visibility state
 * @param {Function} props.onClose - Callback to close dialog
 * @returns {React.ReactElement}
 */
export default function TemplateManager({ onLoadTemplate, isOpen, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState('flowchart');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Get templates for current category
  const templates = getTemplatesByCategory(selectedCategory);

  /**
   * Handle template selection and load into canvas
   * @param {Object} template - Selected template
   */
  const handleLoadTemplate = (template) => {
    const canvasState = createCanvasFromTemplate(template);
    onLoadTemplate(canvasState);
    handleClose();
  };

  /**
   * Close template dialog and reset selection
   */
  const handleClose = () => {
    setSelectedTemplate(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="template-modal-overlay" onClick={handleClose}>
      <div className="template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="template-modal-header">
          <h2>Choose a Template</h2>
          <button className="template-close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="template-modal-content">
          {/* Category tabs */}
          <div className="template-categories">
            <button
              className={`category-tab ${selectedCategory === 'flowchart' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory('flowchart');
                setSelectedTemplate(null);
              }}
            >
              📊 Flowcharts
            </button>
            <button
              className={`category-tab ${selectedCategory === 'kanban' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory('kanban');
                setSelectedTemplate(null);
              }}
            >
              📋 Kanban
            </button>
            <button
              className={`category-tab ${selectedCategory === 'wireframe' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory('wireframe');
                setSelectedTemplate(null);
              }}
            >
              📱 Wireframes
            </button>
            <button
              className={`category-tab ${selectedCategory === 'diagram' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory('diagram');
                setSelectedTemplate(null);
              }}
            >
              🔗 Diagrams
            </button>
          </div>

          {/* Template grid */}
          <div className="template-grid">
            {templates.length > 0 ? (
              templates.map((template) => (
                <div
                  key={template.id}
                  className={`template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div className="template-card-preview">
                    {/* Template preview (could be enhanced with canvas preview) */}
                    <div className="template-icon">
                      {getCategoryIcon(template.category)}
                    </div>
                  </div>
                  <div className="template-card-info">
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="template-empty">
                No templates available for this category
              </div>
            )}
          </div>

          {/* Template details and actions */}
          {selectedTemplate && (
            <div className="template-details">
              <div className="template-details-content">
                <h3>{selectedTemplate.name}</h3>
                <p><strong>Description:</strong> {selectedTemplate.description}</p>
                <p><strong>Category:</strong> {selectedTemplate.category}</p>
                <p><strong>Shapes:</strong> {selectedTemplate.initialShapes?.length || 0}</p>
                <p><strong>Connectors:</strong> {selectedTemplate.initialConnectors?.length || 0}</p>
                <p><strong>Layers:</strong> {selectedTemplate.initialLayers?.length || 0}</p>
              </div>
              <button
                className="template-load-btn"
                onClick={() => handleLoadTemplate(selectedTemplate)}
              >
                Load Template
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Get emoji icon for template category
 * @param {string} category - Template category
 * @returns {string} Emoji icon
 */
function getCategoryIcon(category) {
  const icons = {
    flowchart: '📊',
    kanban: '📋',
    wireframe: '📱',
    diagram: '🔗'
  };
  return icons[category] || '📄';
}
