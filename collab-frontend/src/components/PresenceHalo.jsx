
/**
 * PresenceHalo — marks collaborators who are actively drawing.
 *
 * Driven by Awareness peers rather than a server-side `userPresence` map. Presence is
 * ephemeral by definition, so it belongs in the Awareness protocol and never in the
 * persisted document — otherwise every mouse movement would be written to disk forever.
 *
 * @param {Object} props
 * @param {Array}  props.peers  - [{ userId, cursor: {x,y}, isDrawing }]
 * @param {Object} props.camera - local { x, y, zoom }, to place canvas-space points
 * @param {Object} props.canvasRect - { left, top } of the canvas element
 */
export default function PresenceHalo({ peers, camera, canvasRect }) {
  if (!canvasRect) return null;

  const zoom = camera?.zoom ?? 1;
  const camX = camera?.x ?? 0;
  const camY = camera?.y ?? 0;

  const shadeFor = (userId) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    const shades = ['#f0ece4', '#98928a', '#55504a', '#c9c3b8', '#7d776f'];
    return shades[Math.abs(hash) % shades.length];
  };

  return (
    <div className="presence-halos">
      {(peers || [])
        .filter((p) => p.isDrawing && p.cursor)
        .map((p) => {
          const size = 44;
          const left = canvasRect.left + p.cursor.x * zoom + camX - size / 2;
          const top = canvasRect.top + p.cursor.y * zoom + camY - size / 2;
          return (
            <div
              key={p.userId}
              className="presence-halo drawing"
              style={{
                left,
                top,
                width: size,
                height: size,
                borderColor: shadeFor(p.userId),
              }}
              title={`${p.userId.slice(0, 8)} is drawing`}
            />
          );
        })}
    </div>
  );
}
