import { useEffect, useRef, useState } from 'react';
import './CursorPresence.css';

/**
 * CursorPresence — renders remote users' cursors over the canvas.
 *
 * This is a PURE RENDERER. It used to own its own `cursor-update` socket listener, which
 * collided with the one in useSessionState: that hook tore listeners down with a bare
 * `socket.off('cursor-update')`, which removes *every* handler for the event, including this
 * component's. Child effects run before parent effects, so the hook always won and this
 * component's listener was silently unhooked. One listener, one owner — the hook — and this
 * component just draws what it is given.
 *
 * Positions arrive in CANVAS space and are converted to viewport space here using the live
 * canvas rect and the local camera, so a remote cursor stays attached to the board content
 * regardless of how either side has panned or zoomed.
 *
 * Interpolation here is deliberately minimal. MOTION.md specifies 80 ms buffered, time-based
 * easing; that lands in Sprint 4 along with name chips, join rings and idle fades.
 *
 * @param {Object} props
 * @param {Object} props.cursors       - Map of userId → { x, y, timestamp } in canvas space
 * @param {Array}  props.users         - Array of connected user ids (strings)
 * @param {string} props.currentUserId - Current user's socket ID (excluded from rendering)
 * @param {Object} props.camera        - { x, y, zoom } of the local view
 * @param {Object} props.canvasRef     - Ref to the <canvas> element, for its bounding rect
 */
export default function CursorPresence({ cursors, users, currentUserId, camera, canvasRef }) {
  // The canvas rect is read on a frame tick rather than per render: it changes on resize and
  // layout, and reading it during render would thrash.
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      const el = canvasRef?.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(prev => {
          if (prev && prev.left === r.left && prev.top === r.top) return prev;
          return { left: r.left, top: r.top };
        });
      }
      rafRef.current = requestAnimationFrame(measure);
    };
    rafRef.current = requestAnimationFrame(measure);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef]);

  if (!rect || !cursors) return null;

  const zoom = camera?.zoom ?? 1;
  const camX = camera?.x ?? 0;
  const camY = camera?.y ?? 0;

  // Stable per-user shade so the same collaborator keeps the same cursor between renders.
  const shadeFor = (userId) => {
    const index = Math.max(0, (users || []).indexOf(userId));
    const shades = ['#f0ece4', '#98928a', '#55504a', '#c9c3b8', '#7d776f'];
    return shades[index % shades.length];
  };

  return (
    <>
      {Object.entries(cursors).map(([userId, pos]) => {
        if (userId === currentUserId || !pos) return null;
        return (
          <div
            key={userId}
            className="cursor"
            style={{
              transform: `translate3d(${rect.left + pos.x * zoom + camX}px, ${rect.top + pos.y * zoom + camY}px, 0)`,
              background: shadeFor(userId),
            }}
            title={userId.slice(0, 8)}
          />
        );
      })}
    </>
  );
}
