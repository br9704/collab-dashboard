import { useEffect, useRef, useState } from 'react';
import './CursorPresence.css';

/**
 * CursorPresence — renders remote users' cursors as colored pointer overlays.
 * Uses requestAnimationFrame for smooth cursor interpolation.
 *
 * @param {Object} props
 * @param {Object} props.socket        - Socket.io client instance
 * @param {Object} props.cursors       - Map of userId → { x, y, timestamp }
 * @param {Array}  props.users         - Array of connected user objects
 * @param {string} props.currentUserId - Current user's socket ID (excluded from rendering)
 */
export default function CursorPresence({ socket, cursors, users, currentUserId }) {
  const animationFrameRef = useRef({});
  const [displayCursors, setDisplayCursors] = useState({});

  // Define easing function before useEffect
  const easeOutQuad = (t) => t * (2 - t);

  useEffect(() => {
    if (!socket) return;

    socket.on('cursor-update', (data) => {
      const { userId, x, y } = data;

      // Get current position (or default if first update)
      const fromX = displayCursors[userId]?.x ?? x;
      const fromY = displayCursors[userId]?.y ?? y;

      // Cancel existing animation for this user
      if (animationFrameRef.current[userId]) {
        cancelAnimationFrame(animationFrameRef.current[userId]);
      }

      // Animate to new position over 50ms
      const startTime = Date.now();
      const durationMs = 50;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const easeProgress = easeOutQuad(progress);

        const interpX = fromX + (x - fromX) * easeProgress;
        const interpY = fromY + (y - fromY) * easeProgress;

        setDisplayCursors(prev => ({
          ...prev,
          [userId]: { x: interpX, y: interpY }
        }));

        if (progress < 1) {
          animationFrameRef.current[userId] = requestAnimationFrame(animate);
        }
      };
      animate();
    });

    return () => socket.off('cursor-update');
  }, [socket, displayCursors, easeOutQuad]);

  const getColor = (index) => {
    const colors = ['#ff6b6b', '#4ecdc4', '#6b7280', '#ffa502', '#a8e6cf'];
    return colors[index % colors.length];
  };

  const getUserIndex = (userId) => users.indexOf(userId);

  return (
    <>
      {Object.entries(displayCursors).map(([userId, pos]) =>
        userId !== currentUserId ? (
          <div
            key={userId}
            className="cursor"
            style={{
              left: pos.x,
              top: pos.y,
              background: getColor(getUserIndex(userId)),
              boxShadow: `0 0 8px ${getColor(getUserIndex(userId))}`
            }}
            title={userId.slice(0, 8)}
          />
        ) : null
      )}
    </>
  );
}
