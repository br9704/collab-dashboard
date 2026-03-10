import './PresenceHalo.css';

export default function PresenceHalo({ userPresence, users }) {
  const getColor = (userId) => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffa502', '#a8e6cf'];
    const index = users.indexOf(userId);
    return colors[index % colors.length];
  };

  return (
    <div className="presence-halos">
      {Object.entries(userPresence || {}).map(([userId, presence]) => {
        if (!presence.activeArea) return null;

        const { x, y, x2, y2 } = presence.activeArea;
        const width = x2 - x;
        const height = y2 - y;

        return (
          <div
            key={userId}
            className={`presence-halo ${presence.isDrawing ? 'drawing' : 'idle'}`}
            style={{
              left: x,
              top: y,
              width: width,
              height: height,
              borderColor: getColor(userId),
              opacity: presence.isDrawing ? 0.8 : 0.3
            }}
            title={`${userId.slice(0, 8)} ${presence.isDrawing ? 'drawing' : 'idle'}`}
          >
            {presence.isDrawing && (
              <span className="drawing-indicator" style={{ color: getColor(userId) }}>
                ●
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
