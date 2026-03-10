import './UndoRedoControls.css';

export default function UndoRedoControls({ socket, historyIndex, historyLength }) {
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < (historyLength - 1);

  const handleUndo = () => {
    if (canUndo) {
      socket?.emit('undo');
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      socket?.emit('redo');
    }
  };

  return (
    <div className="undo-redo-controls">
      <button
        onClick={handleUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="undo-button"
      >
        ↶ Undo
      </button>
      <span className="history-info">
        {historyIndex + 1} / {historyLength}
      </span>
      <button
        onClick={handleRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className="redo-button"
      >
        ↷ Redo
      </button>
    </div>
  );
}
