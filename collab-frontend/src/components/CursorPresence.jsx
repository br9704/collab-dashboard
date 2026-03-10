import { useEffect, useRef, useState } from 'react';
import './CursorPresence.css';

export default function CursorPresence({ socket, cursors, users, currentUserId }) {
  const animationFrameRef = useRef({});
  const [displayCursors, setDisplayCursors] = useState({});

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
  }, [socket, displayCursors]);

  const easeOutQuad = (t) => t * (2 - t);

  const getColor = (index) => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffa502', '#a8e6cf'];
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
