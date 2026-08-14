
/**
 * UndoRedoControls — undo/redo for the local user.
 *
 * Backed by a per-user Y.UndoManager rather than a shared server-side stack. This is a
 * behaviour change and an intentional one: the old implementation popped one global history
 * list, so pressing Ctrl+Z could remove a stroke another person had just drawn. Undo now
 * affects your own last action, as it does in every real editor.
 *
 * @param {Object}   props
 * @param {boolean}  props.canUndo - whether this user has anything to undo
 * @param {boolean}  props.canRedo - whether this user has anything to redo
 * @param {Function} props.onUndo
 * @param {Function} props.onRedo
 */
export default function UndoRedoControls({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <div className="undo-redo-controls">
      <button
        onClick={() => canUndo && onUndo?.()}
        disabled={!canUndo}
        title="Undo your last action (Ctrl+Z)"
        aria-label="Undo your last action - Keyboard shortcut: Ctrl+Z or Cmd+Z"
        className="undo-button"
      >
        ↶ Undo
      </button>
      <span className="history-info" role="status" aria-live="polite">
        yours
      </span>
      <button
        onClick={() => canRedo && onRedo?.()}
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
