import { useState, useCallback, useEffect } from 'react';

/**
 * Toast — individual toast notification that auto-dismisses after 3 seconds.
 *
 * @param {Object}   props
 * @param {string}   props.message - Notification text
 * @param {string}   [props.type='info'] - 'success' | 'error' | 'warning' | 'info'
 * @param {Function} props.onClose - Called when toast dismisses
 */
const Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  /**
   * Monospace glyphs rather than SVG icons: SIGNAL uses no pictographs, and an unsized
   * inline <svg> rendered at the container's full height.
   */
  const getIcon = () => {
    const glyph = { success: 'OK', warning: '!!', error: '!!' }[type] || '··';
    return <span className="toast-icon" aria-hidden="true">{glyph}</span>;
  };

  return (
    <div className={`toast toast-${type}`}>
      {getIcon()}
      <span className="toast-message">{message}</span>
    </div>
  );
};

export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const newToasts = [...prev, { id, message, type }];
      // Keep only the last 3 toasts
      return newToasts.slice(-3);
    });
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return {
    addToast,
    ToastContainer: () => <ToastContainer toasts={toasts} removeToast={removeToast} />
  };
};
