import './ActivityLog.css';

/**
 * ActivityLog — displays a timestamped feed of session events.
 * Shows user joins/leaves, strokes, shapes, text changes, and comments
 * in reverse-chronological order with relative timestamps.
 *
 * @param {Object} props
 * @param {Array}  props.activityLog - Array of { action, userId, timestamp, details }
 * @param {Array}  props.users       - Array of connected user objects
 */
export default function ActivityLog({ activityLog, users }) {
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getActionLabel = (action) => {
    const labels = {
      'user-joined': '👤 User joined',
      'user-left': '👤 User left',
      'stroke-added': '✏️ Stroke added',
      'shape-added': '📐 Shape added',
      'text-added': '📝 Text added',
      'text-updated': '📝 Text updated',
      'text-deleted': '📝 Text deleted',
      'comment-added': '💬 Comment added'
    };
    return labels[action] || action;
  };

  return (
    <div className="activity-log">
      <div className="log-header">
        <h3>Activity Log</h3>
        <span className="log-count">{activityLog.length} events</span>
      </div>

      <div className="log-list">
        {activityLog.length === 0 ? (
          <p className="no-activity">No activity yet</p>
        ) : (
          activityLog.slice().reverse().map((entry, i) => (
            <div key={i} className="log-entry">
              <div className="log-action">
                <span className="action-label">{getActionLabel(entry.action)}</span>
                <span className="action-user">
                  {entry.userId?.slice(0, 6) || 'Unknown'}...
                </span>
              </div>
              <div className="log-time">
                {formatTime(entry.timestamp)}
              </div>
              {entry.details && typeof entry.details === 'object' && (
                <div className="log-details">
                  {Object.entries(entry.details).map(([key, value]) => (
                    <span key={key} className="detail-item">
                      {key}: {typeof value === 'object' ? JSON.stringify(value).slice(0, 30) : String(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
