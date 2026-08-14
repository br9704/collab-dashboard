import './CursorPresence.css';

/**
 * CursorPresence — renders collaborators' cursors over the canvas.
 *
 * A PURE RENDERER with a single owner for its data. It used to keep its own
 * `cursor-update` socket listener, which collided with the one in useSessionState: that hook
 * removed listeners with a bare `socket.off('cursor-update')`, which unhooks *every* handler
 * for the event including this component's. Child effects run before parent effects, so the
 * hook always won and this listener was silently killed.
 *
 * Since Sprint 2 the data comes from Awareness peers rather than sockets. Cursor positions
 * are ephemeral state about who is where *right now*; putting them in the persisted document
 * would write every mouse movement to disk forever.
 *
 * Positions arrive in CANVAS space and are converted to viewport space with the canvas rect
 * and the local camera, so a remote cursor stays attached to board content no matter how
 * either side has panned or zoomed.
 *
 * Interpolation is deliberately absent here. MOTION.md specifies 80 ms buffered, time-based
 * easing; that lands in Sprint 4 with name chips, join rings and idle fades.
 *
 * @param {Object} props
 * @param {Array}  props.peers         - [{ userId, cursor: { x, y } }]
 * @param {string} props.currentUserId
 * @param {Object} props.camera        - local { x, y, zoom }
 * @param {Object} props.canvasRect    - { left, top } of the canvas element
 */
export default function CursorPresence({ peers, currentUserId, camera, canvasRect }) {
  if (!canvasRect || !peers?.length) return null;

  const zoom = camera?.zoom ?? 1;
  const camX = camera?.x ?? 0;
  const camY = camera?.y ?? 0;

  // Stable per-user shade, so a collaborator keeps the same cursor between renders.
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
    <>
      {peers.map((peer) => {
        if (!peer.cursor || peer.userId === currentUserId) return null;
        const x = canvasRect.left + peer.cursor.x * zoom + camX;
        const y = canvasRect.top + peer.cursor.y * zoom + camY;
        return (
          <div
            key={peer.clientId ?? peer.userId}
            className="cursor"
            data-user={peer.userId}
            style={{
              transform: `translate3d(${x}px, ${y}px, 0)`,
              background: shadeFor(peer.userId),
            }}
            title={peer.userId.slice(0, 8)}
          />
        );
      })}
    </>
  );
}
