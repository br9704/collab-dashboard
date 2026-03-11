import { useState, useEffect, useRef } from 'react';
import './TextInputDialog.css';

/**
 * TextInputDialog — modal dialog for entering text to place on the canvas.
 * Auto-focuses on mount, supports Enter to submit and Escape to cancel.
 * Replaces the native `prompt()` for better UX.
 *
 * @param {Object}   props
 * @param {number}   props.x        - Canvas X coordinate for text placement
 * @param {number}   props.y        - Canvas Y coordinate for text placement
 * @param {Function} props.onSubmit - Called with the entered text string
 * @param {Function} props.onCancel - Called when dialog is dismissed
 */
export default function TextInputDialog({ x, y, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input immediately on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="text-input-dialog-overlay">
      <div className="text-input-dialog" style={{ left: `${x}px`, top: `${y}px` }}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter text..."
          className="text-input-field"
          maxLength={100}
        />
        <div className="text-input-actions">
          <button onClick={handleSubmit} className="text-btn text-btn-submit">
            Add
          </button>
          <button onClick={onCancel} className="text-btn text-btn-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

