import { useState } from 'react';
import './CommentsPanel.css';

export default function CommentsPanel({ socket, strokeId, comments, currentUserId }) {
  const [newComment, setNewComment] = useState('');

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    socket?.emit('comment-add', {
      strokeId,
      text: newComment
    });

    setNewComment('');
  };

  const handleResolve = (commentId) => {
    socket?.emit('comment-resolve', commentId);
  };

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <div className="comments-panel">
      <div className="comments-header">
        <h3>Comments {unresolvedCount > 0 && <span className="badge">{unresolvedCount}</span>}</h3>
      </div>

      <div className="comments-list">
        {comments.length === 0 ? (
          <p className="no-comments">No comments yet</p>
        ) : (
          comments.map(comment => (
            <div
              key={comment.id}
              className={`comment ${comment.resolved ? 'resolved' : 'unresolved'}`}
            >
              <div className="comment-header">
                <strong>{comment.author.slice(0, 8)}</strong>
                <small>{new Date(comment.timestamp).toLocaleTimeString()}</small>
              </div>
              <p className="comment-text">{comment.text}</p>
              {comment.author === currentUserId && !comment.resolved && (
                <button
                  className="resolve-button"
                  onClick={() => handleResolve(comment.id)}
                >
                  ✓ Resolve
                </button>
              )}
              {comment.resolved && (
                <span className="resolved-badge">✓ Resolved</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add comment form */}
      <div className="add-comment">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleAddComment();
            }
          }}
          placeholder="Add comment... (Ctrl+Enter)"
          maxLength={200}
        />
        <button
          onClick={handleAddComment}
          disabled={!newComment.trim()}
          className="add-button"
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
