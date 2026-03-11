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
        aria-label="Undo last action - Keyboard shortcut: Ctrl+Z or Cmd+Z"
        className="undo-button"
      >
        ↶ Undo
      </button>
      <span className="history-info" role="status" aria-live="polite" aria-label={`History position: ${historyIndex + 1} of ${historyLength}`}>
        {historyIndex + 1} / {historyLength}
      </span>
      <button
        onClick={handleRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo last undone action - Keyboard shortcut: Ctrl+Y or Cmd+Shift+Z"
        className="redo-button"
      >
        ↷ Redo
      </button>
    </div>
  );
}
