/**
 * Pre-made templates for collaborative whiteboarding
 * Provides flowchart, kanban, wireframe, and custom templates
 */

/**
 * Template data structure:
 * @typedef {Object} Template
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Short description
 * @property {string} category - 'flowchart' | 'kanban' | 'wireframe' | 'diagram'
 * @property {Array} initialShapes - Pre-created shapes
 * @property {Array} initialStrokes - Optional guide lines
 * @property {Array} initialLayers - Layer structure
 */

export const TEMPLATES = {
  // Flowchart template: Standard process flowchart with decision points
  flowchart: {
    id: 'template-flowchart-basic',
    name: 'Basic Flowchart',
    description: 'Start → Process → Decision → End flowchart layout',
    category: 'flowchart',
    initialShapes: [
      {
        id: 'shape-start',
        type: 'oval',
        x: 400,
        y: 50,
        width: 100,
        height: 60,
        color: '#4CAF50',
        label: 'Start',
        layerId: 'layer-shapes'
      },
      {
        id: 'shape-process1',
        type: 'rectangle',
        x: 375,
        y: 150,
        width: 150,
        height: 80,
        color: '#2196F3',
        label: 'Process Step 1',
        layerId: 'layer-shapes'
      },
      {
        id: 'shape-decision',
        type: 'diamond',
        x: 375,
        y: 300,
        width: 150,
        height: 120,
        color: '#FF9800',
        label: 'Decision?',
        layerId: 'layer-shapes'
      },
      {
        id: 'shape-process2',
        type: 'rectangle',
        x: 150,
        y: 300,
        width: 150,
        height: 80,
        color: '#2196F3',
        label: 'Process Step 2',
        layerId: 'layer-shapes'
      },
      {
        id: 'shape-end',
        type: 'oval',
        x: 400,
        y: 500,
        width: 100,
        height: 60,
        color: '#F44336',
        label: 'End',
        layerId: 'layer-shapes'
      }
    ],
    initialConnectors: [
      { id: 'conn-1', from: 'shape-start', to: 'shape-process1' },
      { id: 'conn-2', from: 'shape-process1', to: 'shape-decision' },
      { id: 'conn-3', from: 'shape-decision', to: 'shape-process2', label: 'No' },
      { id: 'conn-4', from: 'shape-decision', to: 'shape-end', label: 'Yes' },
      { id: 'conn-5', from: 'shape-process2', to: 'shape-decision' }
    ],
    initialLayers: [
      { id: 'layer-shapes', name: 'Shapes', visible: true },
      { id: 'layer-connectors', name: 'Connectors', visible: true }
    ]
  },

  // Kanban board template: Task management board with columns
  kanban: {
    id: 'template-kanban-standard',
    name: 'Kanban Board',
    description: 'To Do → In Progress → Done kanban columns',
    category: 'kanban',
    initialShapes: [
      // Column headers
      {
        id: 'kanban-header-todo',
        type: 'rectangle',
        x: 50,
        y: 20,
        width: 200,
        height: 40,
        color: '#E0E0E0',
        label: 'TO DO',
        layerId: 'layer-kanban'
      },
      {
        id: 'kanban-header-progress',
        type: 'rectangle',
        x: 300,
        y: 20,
        width: 200,
        height: 40,
        color: '#E0E0E0',
        label: 'IN PROGRESS',
        layerId: 'layer-kanban'
      },
      {
        id: 'kanban-header-done',
        type: 'rectangle',
        x: 550,
        y: 20,
        width: 200,
        height: 40,
        color: '#E0E0E0',
        label: 'DONE',
        layerId: 'layer-kanban'
      },
      // Sample cards
      {
        id: 'kanban-card-1',
        type: 'rectangle',
        x: 60,
        y: 80,
        width: 180,
        height: 60,
        color: '#BBDEFB',
        label: 'Task 1',
        layerId: 'layer-kanban-items'
      },
      {
        id: 'kanban-card-2',
        type: 'rectangle',
        x: 310,
        y: 80,
        width: 180,
        height: 60,
        color: '#FFF9C4',
        label: 'Task 2',
        layerId: 'layer-kanban-items'
      },
      {
        id: 'kanban-card-3',
        type: 'rectangle',
        x: 560,
        y: 80,
        width: 180,
        height: 60,
        color: '#C8E6C9',
        label: 'Task 3',
        layerId: 'layer-kanban-items'
      }
    ],
    initialLayers: [
      { id: 'layer-kanban', name: 'Kanban Board', visible: true },
      { id: 'layer-kanban-items', name: 'Cards', visible: true }
    ]
  },

  // Wireframe template: Mobile/web app wireframe structure
  wireframe: {
    id: 'template-wireframe-mobile',
    name: 'Mobile Wireframe',
    description: 'Mobile app wireframe with header, content, footer',
    category: 'wireframe',
    initialShapes: [
      // Device frame
      {
        id: 'wireframe-frame',
        type: 'rectangle',
        x: 100,
        y: 20,
        width: 280,
        height: 500,
        color: '#000000',
        filled: false,
        width: 3,
        layerId: 'layer-wireframe'
      },
      // Header
      {
        id: 'wireframe-header',
        type: 'rectangle',
        x: 110,
        y: 30,
        width: 260,
        height: 50,
        color: '#4b5563',
        label: 'Header',
        layerId: 'layer-wireframe'
      },
      // Content area 1
      {
        id: 'wireframe-content1',
        type: 'rectangle',
        x: 110,
        y: 90,
        width: 260,
        height: 80,
        color: '#E0E0E0',
        label: 'Content Block 1',
        layerId: 'layer-wireframe'
      },
      // Content area 2
      {
        id: 'wireframe-content2',
        type: 'rectangle',
        x: 110,
        y: 180,
        width: 260,
        height: 80,
        color: '#E0E0E0',
        label: 'Content Block 2',
        layerId: 'layer-wireframe'
      },
      // Content area 3
      {
        id: 'wireframe-content3',
        type: 'rectangle',
        x: 110,
        y: 270,
        width: 260,
        height: 80,
        color: '#E0E0E0',
        label: 'Content Block 3',
        layerId: 'layer-wireframe'
      },
      // Footer
      {
        id: 'wireframe-footer',
        type: 'rectangle',
        x: 110,
        y: 360,
        width: 260,
        height: 150,
        color: '#BDBDBD',
        label: 'Navigation',
        layerId: 'layer-wireframe'
      }
    ],
    initialLayers: [
      { id: 'layer-wireframe', name: 'Wireframe', visible: true }
    ]
  },

  // Sequence diagram template: Interaction flow between actors
  sequenceDiagram: {
    id: 'template-sequence-diagram',
    name: 'Sequence Diagram',
    description: 'Actor interaction sequence timeline',
    category: 'diagram',
    initialShapes: [
      // Actors
      {
        id: 'sequence-actor1',
        type: 'rectangle',
        x: 50,
        y: 20,
        width: 100,
        height: 40,
        color: '#2196F3',
        label: 'User',
        layerId: 'layer-sequence'
      },
      {
        id: 'sequence-actor2',
        type: 'rectangle',
        x: 250,
        y: 20,
        width: 100,
        height: 40,
        color: '#2196F3',
        label: 'System',
        layerId: 'layer-sequence'
      },
      {
        id: 'sequence-actor3',
        type: 'rectangle',
        x: 450,
        y: 20,
        width: 100,
        height: 40,
        color: '#2196F3',
        label: 'Database',
        layerId: 'layer-sequence'
      },
      // Interaction lines (would be enhanced with connectors)
      {
        id: 'sequence-line1',
        type: 'line',
        x: 100,
        y: 120,
        points: [{ x: 100, y: 120 }, { x: 300, y: 120 }],
        color: '#333333',
        label: 'Request',
        layerId: 'layer-sequence'
      },
      {
        id: 'sequence-line2',
        type: 'line',
        x: 300,
        y: 160,
        points: [{ x: 300, y: 160 }, { x: 500, y: 160 }],
        color: '#333333',
        label: 'Query',
        layerId: 'layer-sequence'
      }
    ],
    initialLayers: [
      { id: 'layer-sequence', name: 'Sequence', visible: true }
    ]
  },

  // Mindmap template: Central topic with branches
  mindmap: {
    id: 'template-mindmap-standard',
    name: 'Mind Map',
    description: 'Central topic with branching subtopics',
    category: 'diagram',
    initialShapes: [
      // Central topic
      {
        id: 'mindmap-center',
        type: 'circle',
        x: 400,
        y: 250,
        width: 80,
        height: 80,
        color: '#FF5722',
        label: 'Main Topic',
        layerId: 'layer-mindmap'
      },
      // Branch 1
      {
        id: 'mindmap-branch1',
        type: 'circle',
        x: 100,
        y: 100,
        width: 60,
        height: 60,
        color: '#FF9800',
        label: 'Branch 1',
        layerId: 'layer-mindmap'
      },
      // Branch 2
      {
        id: 'mindmap-branch2',
        type: 'circle',
        x: 700,
        y: 100,
        width: 60,
        height: 60,
        color: '#FF9800',
        label: 'Branch 2',
        layerId: 'layer-mindmap'
      },
      // Branch 3
      {
        id: 'mindmap-branch3',
        type: 'circle',
        x: 400,
        y: 420,
        width: 60,
        height: 60,
        color: '#FF9800',
        label: 'Branch 3',
        layerId: 'layer-mindmap'
      }
    ],
    initialConnectors: [
      { id: 'mindmap-conn-1', from: 'mindmap-center', to: 'mindmap-branch1' },
      { id: 'mindmap-conn-2', from: 'mindmap-center', to: 'mindmap-branch2' },
      { id: 'mindmap-conn-3', from: 'mindmap-center', to: 'mindmap-branch3' }
    ],
    initialLayers: [
      { id: 'layer-mindmap', name: 'Mind Map', visible: true }
    ]
  }
};

/**
 * Get all available templates
 * @returns {Array} Array of template objects with metadata
 */
export const getAvailableTemplates = () => {
  return Object.entries(TEMPLATES).map(([key, template]) => ({
    ...template,
    key
  }));
};

/**
 * Get template by ID
 * @param {string} templateId - Template identifier
 * @returns {Object|null} Template object or null if not found
 */
export const getTemplateById = (templateId) => {
  return Object.values(TEMPLATES).find(t => t.id === templateId) || null;
};

/**
 * Get templates by category
 * @param {string} category - Template category (flowchart, kanban, wireframe, diagram)
 * @returns {Array} Filtered templates
 */
export const getTemplatesByCategory = (category) => {
  return Object.entries(TEMPLATES)
    .filter(([_, template]) => template.category === category)
    .map(([key, template]) => ({ ...template, key }));
};

/**
 * Create a new canvas state from template
 * @param {Object} template - Template object
 * @returns {Object} Initial canvas state
 */
export const createCanvasFromTemplate = (template) => {
  return {
    shapes: template.initialShapes || [],
    connectors: template.initialConnectors || [],
    layers: template.initialLayers || [{ id: 'layer-default', name: 'Default', visible: true }],
    strokes: [],
    texts: [],
    createdAt: new Date().toISOString()
  };
};

