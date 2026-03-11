import { useState } from 'react';
import './LayersPanel.css';

/**
 * LayersPanel — sidebar for managing drawing layers.
 * Supports creating, deleting, renaming, reordering, and toggling layer visibility.
 *
 * @param {Object}   props
 * @param {Array}    props.layers         - Array of layer objects
 * @param {Array}    props.layerOrder     - Ordered array of layer IDs
 * @param {Function} props.onLayerCreate  - Creates a new layer
 * @param {Function} props.onLayerDelete  - Deletes a layer by ID
 * @param {Function} props.onLayerUpdate  - Updates layer properties
 * @param {Function} props.onLayerReorder - Reorders layers
 * @param {boolean}  props.canEdit        - Whether the current user can modify layers
 */
export default function LayersPanel({ 
  layers = [], 
  layerOrder = [], 
  onLayerCreate,
  onLayerDelete,
  onLayerUpdate,
  onLayerReorder,
  canEdit = true
}) {
  const [newLayerName, setNewLayerName] = useState('');
  const [draggedLayerId, setDraggedLayerId] = useState(null);
  const [editingLayerId, setEditingLayerId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const handleCreateLayer = () => {
    if (newLayerName.trim()) {
      onLayerCreate(newLayerName);
      setNewLayerName('');
    }
  };

  const handleDeleteLayer = (layerId) => {
    onLayerDelete(layerId);
  };

  const handleToggleVisibility = (layerId) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
      onLayerUpdate(layerId, { visible: !layer.visible });
    }
  };

  const handleToggleLock = (layerId) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
      onLayerUpdate(layerId, { locked: !layer.locked });
    }
  };

  const handleStartRename = (layerId, currentName) => {
    setEditingLayerId(layerId);
    setEditingName(currentName);
  };

  const handleSaveRename = (layerId) => {
    if (editingName.trim()) {
      onLayerUpdate(layerId, { name: editingName });
    }
    setEditingLayerId(null);
    setEditingName('');
  };

  const handleDragStart = (e, layerId) => {
    setDraggedLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetLayerId) => {
    e.preventDefault();
    if (draggedLayerId && draggedLayerId !== targetLayerId) {
      const newOrder = [...layerOrder];
      const draggedIndex = newOrder.indexOf(draggedLayerId);
      const targetIndex = newOrder.indexOf(targetLayerId);
      
      // Swap positions
      [newOrder[draggedIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[draggedIndex]];
      onLayerReorder(newOrder);
    }
    setDraggedLayerId(null);
  };

  const handleDragEnd = () => {
    setDraggedLayerId(null);
  };

  // Sort layers by layerOrder
  const sortedLayers = layerOrder
    .map(id => layers.find(l => l.id === id))
    .filter(Boolean);

  return (
    <div className="layers-panel">
      <div className="layers-header">
        <h3>Layers</h3>
        {canEdit && (
          <div className="layer-controls">
            <input
              type="text"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateLayer();
                }
              }}
              placeholder="New layer..."
              className="layer-input"
              maxLength={30}
            />
            <button
              onClick={handleCreateLayer}
              className="add-layer-button"
              disabled={!newLayerName.trim()}
              title="Add new layer"
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="layers-list">
        {sortedLayers.length === 0 ? (
          <div className="empty-state">No layers yet</div>
        ) : (
          sortedLayers.map((layer) => (
            <div
              key={layer.id}
              className={`layer-item ${draggedLayerId === layer.id ? 'dragging' : ''}`}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, layer.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, layer.id)}
              onDragEnd={handleDragEnd}
            >
              {canEdit && (
                <>
                  <button
                    className="layer-visibility"
                    onClick={() => handleToggleVisibility(layer.id)}
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                  >
                    {layer.visible ? '👁️' : '🚫'}
                  </button>

                  <button
                    className="layer-lock"
                    onClick={() => handleToggleLock(layer.id)}
                    title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                </>
              )}

              {editingLayerId === layer.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveRename(layer.id);
                    }
                  }}
                  onBlur={() => handleSaveRename(layer.id)}
                  autoFocus
                  maxLength={30}
                  className="layer-name-edit"
                />
              ) : (
                <span
                  className="layer-name"
                  onDoubleClick={() => handleStartRename(layer.id, layer.name)}
                  title="Double-click to rename"
                >
                  {layer.name}
                </span>
              )}

              {canEdit && (
                <button
                  className="layer-delete"
                  onClick={() => handleDeleteLayer(layer.id)}
                  title="Delete layer"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
