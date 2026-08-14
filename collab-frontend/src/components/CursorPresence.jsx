import { useEffect, useRef } from 'react';

/**
 * CursorPresence — remote cursors, per MOTION.md.
 *
 * "Most movement on screen is other people." Raw Awareness updates arrive at ~30Hz and
 * jitter; rendered directly they teleport. This eases each cursor toward its latest known
 * position so it reads as a hand rather than a series of jumps.
 *
 * THE INTERPOLATION IS TIME-BASED, NOT FRAME-BASED.
 *   alpha = 1 - exp(-dt / TAU)
 * A naive `pos += (target - pos) * 0.2` per frame moves twice as fast on a 144Hz display as
 * on a 60Hz one — the same motion spec would feel different on different monitors. Deriving
 * alpha from elapsed time makes the curve identical at any refresh rate, which MOTION.md
 * requires and which is verified in the acceptance gate.
 *
 * Positions are written straight to the DOM inside the rAF loop. Routing 30Hz × N cursors
 * through React state would re-render the tree on every packet for no benefit.
 *
 * Transform only — never `left`/`top`, and never a CSS transition on position.
 *
 * @param {Array}  props.peers      - [{ userId, cursor: {x,y} }] in CANVAS space
 * @param {Object} props.camera     - local { x, y, zoom }
 * @param {Object} props.canvasRect - { left, top } of the canvas element
 */

const TAU = 80;            // ms — the buffer MOTION.md specifies
const CHIP_TRAIL = 12;     // px the name chip trails behind movement
const IDLE_CHIP_MS = 2000; // chip fades to 40% after this
const IDLE_DIM_MS = 30000; // cursor dims to 25% after this
const JOIN_RING_MS = 200;

const SHADES = ['#f0ece4', '#98928a', '#55504a', '#c9c3b8', '#7d776f'];

function shadeFor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return SHADES[Math.abs(hash) % SHADES.length];
}

export default function CursorPresence({ peers, currentUserId, camera, canvasRect }) {
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());   // userId -> { dot, chip, ring, state }
  const latestRef = useRef({ peers: [], camera, canvasRect });
  const rafRef = useRef(null);

  latestRef.current = { peers, camera, canvasRect };

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let prev = performance.now();

    const frame = (now) => {
      const dt = Math.min(now - prev, 100); // clamp: a backgrounded tab must not lurch
      prev = now;

      // Time-based smoothing factor. Reduced motion snaps instead of gliding.
      const alpha = reduced ? 1 : 1 - Math.exp(-dt / TAU);

      const { peers: livePeers, camera: cam, canvasRect: rect } = latestRef.current;
      if (!rect) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const zoom = cam?.zoom ?? 1;
      const camX = cam?.x ?? 0;
      const camY = cam?.y ?? 0;
      const seen = new Set();

      for (const peer of livePeers || []) {
        if (!peer.cursor || peer.userId === currentUserId) continue;
        seen.add(peer.userId);

        const targetX = rect.left + peer.cursor.x * zoom + camX;
        const targetY = rect.top + peer.cursor.y * zoom + camY;

        let entry = nodesRef.current.get(peer.userId);
        if (!entry) {
          entry = createCursor(layer, peer.userId, targetX, targetY, now);
          nodesRef.current.set(peer.userId, entry);
        }

        const s = entry.state;
        // A cursor that has jumped is a new position, not motion: if the peer moved,
        // record when, so idle timers are about genuine stillness.
        if (targetX !== s.targetX || targetY !== s.targetY) {
          s.targetX = targetX;
          s.targetY = targetY;
          s.lastMoved = now;
        }

        s.x += (s.targetX - s.x) * alpha;
        s.y += (s.targetY - s.y) * alpha;

        entry.dot.style.transform = `translate3d(${s.x - 4.5}px, ${s.y - 4.5}px, 0)`;

        // The chip trails behind the direction of travel, so it reads as attached.
        const dx = s.targetX - s.x;
        const dy = s.targetY - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const trailX = s.x - (dx / len) * CHIP_TRAIL;
        const trailY = s.y - (dy / len) * CHIP_TRAIL;
        entry.chip.style.transform = `translate3d(${trailX + 8}px, ${trailY + 6}px, 0)`;

        const idle = now - s.lastMoved;
        entry.chip.style.opacity = idle > IDLE_CHIP_MS ? '0.4' : '1';
        entry.dot.style.opacity = idle > IDLE_DIM_MS ? '0.25' : '1';

        // Join: one expanding 1px ring, 200ms, then gone.
        const age = now - s.joinedAt;
        if (age < JOIN_RING_MS && !reduced) {
          const t = age / JOIN_RING_MS;
          entry.ring.style.opacity = String(1 - t);
          entry.ring.style.transform =
            `translate3d(${s.x - 4.5}px, ${s.y - 4.5}px, 0) scale(${1 + t * 3})`;
          entry.dot.style.transform =
            `translate3d(${s.x - 4.5}px, ${s.y - 4.5}px, 0) scale(${t})`;
        } else if (entry.ring.style.opacity !== '0') {
          entry.ring.style.opacity = '0';
        }
      }

      // Leave: fade out over 400ms, then remove.
      for (const [userId, entry] of nodesRef.current) {
        if (seen.has(userId)) continue;
        if (!entry.state.leftAt) entry.state.leftAt = now;
        const t = (now - entry.state.leftAt) / 400;
        if (t >= 1 || reduced) {
          entry.dot.remove();
          entry.chip.remove();
          entry.ring.remove();
          nodesRef.current.delete(userId);
        } else {
          const o = String(1 - t);
          entry.dot.style.opacity = o;
          entry.chip.style.opacity = o;
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      nodesRef.current.forEach((e) => { e.dot.remove(); e.chip.remove(); e.ring.remove(); });
      nodesRef.current.clear();
    };
  }, [currentUserId]);

  return <div ref={layerRef} className="cursor-layer" aria-hidden="true" />;
}

function createCursor(layer, userId, x, y, now) {
  const shade = shadeFor(userId);

  const dot = document.createElement('div');
  dot.className = 'cursor';
  dot.dataset.user = userId;
  dot.style.background = shade;

  const chip = document.createElement('div');
  chip.className = 'cursor-chip';
  chip.textContent = userId.slice(0, 8);

  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.style.opacity = '0';

  layer.append(ring, dot, chip);

  return {
    dot,
    chip,
    ring,
    state: { x, y, targetX: x, targetY: y, joinedAt: now, lastMoved: now, leftAt: null },
  };
}
