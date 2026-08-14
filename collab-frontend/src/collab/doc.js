/**
 * DOC.JS — the shared document model.
 *
 * One Y.Doc per board. Two top-level shared types:
 *
 *   elements : Y.Map   elementId -> stroke | shape | text
 *   comments : Y.Map   commentId -> comment
 *
 * MODELLING RULES (these are the difference between a CRDT that works and one that melts):
 *
 * 1. A STROKE IS INSERTED ONCE, AS AN IMMUTABLE POINT ARRAY.
 *    The naive version — one CRDT operation per sampled point — produces thousands of
 *    operations per minute of drawing, and the document grows without bound because CRDT
 *    history cannot be compacted away. A finished stroke is a value, not a collaboration
 *    surface: nobody edits the 47th point of someone else's pen stroke. One op per stroke.
 *
 * 2. TEXT IS THE EXCEPTION, AND USES Y.TEXT.
 *    Text bodies genuinely are concurrently edited, so they get character-level merge. Text
 *    elements are Y.Maps holding a Y.Text `body`; everything else is a plain object.
 *
 * 3. NOTHING EPHEMERAL GOES IN THE DOCUMENT.
 *    Cursors, camera and "is drawing" live in Awareness. Putting them in the document would
 *    persist every mouse movement to disk forever.
 *
 * 4. ORDERING IS EXPLICIT.
 *    Y.Map has no meaningful iteration order, so every element carries a `seq` and render
 *    order is `sort(by seq)`. Lamport-ish: wall clock plus a per-client counter, which is
 *    stable enough for z-order and never needs to be exact.
 */

import * as Y from 'yjs';

export const ELEMENTS = 'elements';
export const COMMENTS = 'comments';

export const KIND = {
  STROKE: 'stroke',
  SHAPE: 'shape',
  TEXT: 'text',
};

let seqCounter = 0;

/** Monotonic-enough ordering key. */
export function nextSeq() {
  seqCounter = (seqCounter + 1) % 1000;
  return Date.now() * 1000 + seqCounter;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getElements(ydoc) {
  return ydoc.getMap(ELEMENTS);
}

export function getComments(ydoc) {
  return ydoc.getMap(COMMENTS);
}

/**
 * Materialise the document into the plain array the renderer wants.
 *
 * Called on every document change, so it stays deliberately cheap: no deep cloning of point
 * arrays, which are immutable by rule 1 and can be handed to the canvas by reference.
 */
export function readElements(ydoc) {
  const map = getElements(ydoc);
  const out = [];

  map.forEach((value, id) => {
    if (value instanceof Y.Map) {
      // Text elements: a Y.Map with a Y.Text body.
      const body = value.get('body');
      out.push({
        id,
        kind: value.get('kind') || KIND.TEXT,
        userId: value.get('userId'),
        x: value.get('x'),
        y: value.get('y'),
        color: value.get('color'),
        seq: value.get('seq') || 0,
        text: body && body.toString ? body.toString() : '',
      });
    } else if (value && typeof value === 'object') {
      out.push({ id, ...value });
    }
  });

  out.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return out;
}

export function readComments(ydoc) {
  const map = getComments(ydoc);
  const out = [];
  map.forEach((value, id) => {
    if (value && typeof value === 'object') out.push({ id, ...value });
  });
  out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return out;
}

// ── Mutations ─────────────────────────────────────────────────────────────
// Every mutation runs inside a transaction tagged with `origin`, which is how the per-user
// UndoManager knows which changes are yours. Without the tag, Ctrl+Z would undo whatever
// happened most recently on the board — including other people's work.

export function addStroke(ydoc, origin, { points, color, width, userId }) {
  const id = newId('stroke');
  ydoc.transact(() => {
    getElements(ydoc).set(id, {
      kind: KIND.STROKE,
      userId,
      // Frozen by convention: never mutated after insert (rule 1).
      points,
      color,
      width,
      seq: nextSeq(),
      timestamp: Date.now(),
    });
  }, origin);
  return id;
}

export function addShape(ydoc, origin, { type, points, bounds, color, width, userId, recognized }) {
  const id = newId('shape');
  ydoc.transact(() => {
    getElements(ydoc).set(id, {
      kind: KIND.SHAPE,
      userId,
      type,
      points,
      bounds: bounds || null,
      color,
      width,
      recognized: !!recognized,
      seq: nextSeq(),
      timestamp: Date.now(),
    });
  }, origin);
  return id;
}

/** Text gets a Y.Text body so two people editing the same box merge instead of clobbering. */
export function addText(ydoc, origin, { text, x, y, color, userId }) {
  const id = newId('text');
  ydoc.transact(() => {
    const el = new Y.Map();
    const body = new Y.Text();
    body.insert(0, text || '');
    el.set('kind', KIND.TEXT);
    el.set('userId', userId);
    el.set('x', x);
    el.set('y', y);
    el.set('color', color);
    el.set('seq', nextSeq());
    el.set('body', body);
    getElements(ydoc).set(id, el);
  }, origin);
  return id;
}

/**
 * Replace a text body via a diff rather than delete-all + insert-all.
 *
 * Clearing and rewriting would make every concurrent edit a conflict and would destroy the
 * other writer's characters. Trimming only the changed prefix/suffix keeps the merge useful.
 */
export function updateTextBody(ydoc, origin, id, nextText) {
  const el = getElements(ydoc).get(id);
  if (!(el instanceof Y.Map)) return;
  const body = el.get('body');
  if (!body) return;

  const prev = body.toString();
  if (prev === nextText) return;

  let start = 0;
  while (start < prev.length && start < nextText.length && prev[start] === nextText[start]) start++;

  let endPrev = prev.length;
  let endNext = nextText.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === nextText[endNext - 1]) {
    endPrev--;
    endNext--;
  }

  ydoc.transact(() => {
    if (endPrev > start) body.delete(start, endPrev - start);
    if (endNext > start) body.insert(start, nextText.slice(start, endNext));
  }, origin);
}

export function deleteElement(ydoc, origin, id) {
  ydoc.transact(() => {
    getElements(ydoc).delete(id);
  }, origin);
}

export function addComment(ydoc, origin, { elementId, text, author }) {
  const id = newId('comment');
  ydoc.transact(() => {
    getComments(ydoc).set(id, {
      elementId,
      text,
      author,
      resolved: false,
      timestamp: Date.now(),
    });
  }, origin);
  return id;
}

export function resolveComment(ydoc, origin, id) {
  const map = getComments(ydoc);
  const c = map.get(id);
  if (!c) return;
  ydoc.transact(() => {
    map.set(id, { ...c, resolved: true });
  }, origin);
}
