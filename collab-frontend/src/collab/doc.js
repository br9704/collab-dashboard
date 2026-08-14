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
export const LAYERS = 'layers';
export const LAYER_ORDER = 'layerOrder';

export const KIND = {
  STROKE: 'stroke',
  SHAPE: 'shape',
  TEXT: 'text',
  VIDEO: 'video',
  CONNECTOR: 'connector',
};

export const DEFAULT_LAYER_ID = 'layer-default';

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

export function getLayers(ydoc) {
  return ydoc.getMap(LAYERS);
}

/** Layer z-order. A Y.Array, because order IS the data here — unlike elements, which sort by seq. */
export function getLayerOrder(ydoc) {
  return ydoc.getArray(LAYER_ORDER);
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
        layerId: value.get('layerId') || DEFAULT_LAYER_ID,
        formatting: value.get('formatting') || {},
        text: body && body.toString ? body.toString() : '',
      });
    } else if (value && typeof value === 'object') {
      // `id` LAST: the Map key is authoritative. Spreading it last was letting a stored
      // `id` field override the real key — every video embed came back with id undefined,
      // which React reported as duplicate keys and which broke move/remove by id.
      out.push({ ...value, id });
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

// ──────────────────────────────────────────────────────────────────────────
// Sprint 3 — the features that previously emitted into the void.
//
// Layers, text formatting, templates, smart shapes and video embeds all used to emit socket
// events that no server handler had ever listened for. They are document state, so they
// belong in the Y.Doc alongside everything else rather than in a parallel channel.
// ──────────────────────────────────────────────────────────────────────────

export function readLayers(ydoc) {
  const map = getLayers(ydoc);
  const order = getLayerOrder(ydoc).toArray();
  const layers = [];

  order.forEach((id) => {
    const l = map.get(id);
    if (l) layers.push({ id, ...l });
  });

  // Anything present in the map but missing from the order array (concurrent insert races)
  // still has to render, or elements on it would silently vanish.
  map.forEach((l, id) => {
    if (!order.includes(id)) layers.push({ id, ...l });
  });

  return layers;
}

export function readLayerOrder(ydoc) {
  return getLayerOrder(ydoc).toArray();
}

/** Every board has a default layer, created lazily so existing documents pick one up. */
export function ensureDefaultLayer(ydoc, origin) {
  const layers = getLayers(ydoc);
  if (layers.size > 0) return DEFAULT_LAYER_ID;
  ydoc.transact(() => {
    layers.set(DEFAULT_LAYER_ID, {
      name: 'Default',
      visible: true,
      locked: false,
      opacity: 1,
      createdAt: Date.now(),
    });
    getLayerOrder(ydoc).push([DEFAULT_LAYER_ID]);
  }, origin);
  return DEFAULT_LAYER_ID;
}

export function createLayer(ydoc, origin, name) {
  const id = newId('layer');
  ydoc.transact(() => {
    getLayers(ydoc).set(id, {
      name: name || 'Layer',
      visible: true,
      locked: false,
      opacity: 1,
      createdAt: Date.now(),
    });
    getLayerOrder(ydoc).push([id]);
  }, origin);
  return id;
}

export function updateLayer(ydoc, origin, id, updates) {
  const layers = getLayers(ydoc);
  const current = layers.get(id);
  if (!current) return;
  ydoc.transact(() => {
    layers.set(id, { ...current, ...updates });
  }, origin);
}

/**
 * Delete a layer and everything drawn on it.
 *
 * Orphaning the elements instead would leave ink on the board that no layer control can
 * reach — invisible to the layers panel but still rendered, and impossible to remove.
 */
export function deleteLayer(ydoc, origin, id) {
  if (id === DEFAULT_LAYER_ID) return;
  ydoc.transact(() => {
    const elements = getElements(ydoc);
    const doomed = [];
    elements.forEach((value, elementId) => {
      const layerId = value instanceof Y.Map ? value.get('layerId') : value?.layerId;
      if (layerId === id) doomed.push(elementId);
    });
    doomed.forEach((elementId) => elements.delete(elementId));

    getLayers(ydoc).delete(id);

    const order = getLayerOrder(ydoc);
    const index = order.toArray().indexOf(id);
    if (index >= 0) order.delete(index, 1);
  }, origin);
}

/**
 * Reorder layers by rewriting the order array inside one transaction.
 *
 * Y.Array has no move operation; delete-then-insert in a single transaction is the standard
 * approach and keeps the change atomic for the UndoManager.
 */
export function reorderLayers(ydoc, origin, newOrder) {
  const order = getLayerOrder(ydoc);
  ydoc.transact(() => {
    order.delete(0, order.length);
    order.push(newOrder);
  }, origin);
}

/** Assign an element to a layer. Works for both plain-object and Y.Map elements. */
export function setElementLayer(ydoc, origin, elementId, layerId) {
  const elements = getElements(ydoc);
  const el = elements.get(elementId);
  if (!el) return;
  ydoc.transact(() => {
    if (el instanceof Y.Map) el.set('layerId', layerId);
    else elements.set(elementId, { ...el, layerId });
  }, origin);
}

/**
 * Text formatting (bold / italic / underline / size).
 *
 * Stored as a whole object rather than per-property keys: formatting is a small, rarely
 * concurrent value, and last-writer-wins on the whole object is easier to reason about than
 * a half-applied merge of two people's styling.
 */
export function setTextFormatting(ydoc, origin, id, formatting) {
  const el = getElements(ydoc).get(id);
  if (!(el instanceof Y.Map)) return;
  ydoc.transact(() => {
    el.set('formatting', { ...(el.get('formatting') || {}), ...formatting });
  }, origin);
}

/** A smart shape: a positioned box with a label, drawn by SHAPE_CONFIG's renderer. */
export function placeSmartShape(ydoc, origin, shape) {
  const id = newId('smart');
  ydoc.transact(() => {
    getElements(ydoc).set(id, {
      kind: KIND.SHAPE,
      smart: true,
      seq: nextSeq(),
      timestamp: Date.now(),
      layerId: shape.layerId || DEFAULT_LAYER_ID,
      ...shape,
    });
  }, origin);
  return id;
}

export function addVideoEmbed(ydoc, origin, embed) {
  const { id: providedId, ...rest } = embed;
  const id = providedId || newId('video');
  ydoc.transact(() => {
    // The Map key IS the id; storing it again in the value would shadow the key on read.
    getElements(ydoc).set(id, {
      kind: KIND.VIDEO,
      seq: nextSeq(),
      timestamp: Date.now(),
      layerId: embed.layerId || DEFAULT_LAYER_ID,
      ...rest,
    });
  }, origin);
  return id;
}

export function moveVideoEmbed(ydoc, origin, id, x, y) {
  const elements = getElements(ydoc);
  const el = elements.get(id);
  if (!el || el.kind !== KIND.VIDEO) return;
  ydoc.transact(() => {
    elements.set(id, { ...el, x, y });
  }, origin);
}

/**
 * Load a template.
 *
 * ONE transaction for the whole template. Inserting shape by shape would give every
 * collaborator a half-built diagram for a few frames, and would give the UndoManager dozens
 * of separate stack items so undoing a template load would take dozens of Ctrl+Z presses.
 *
 * Additive, not destructive: the previous behaviour replaced the canvas outright, which on a
 * shared board would silently delete everyone else's work.
 */
export function loadTemplate(ydoc, origin, canvasState) {
  if (!canvasState) return { layers: 0, elements: 0 };

  let layerCount = 0;
  let elementCount = 0;

  ydoc.transact(() => {
    const layers = getLayers(ydoc);
    const order = getLayerOrder(ydoc);
    const elements = getElements(ydoc);

    (canvasState.layers || []).forEach((layer) => {
      if (layers.has(layer.id)) return;
      layers.set(layer.id, {
        name: layer.name || 'Layer',
        visible: layer.visible !== false,
        locked: false,
        opacity: 1,
        createdAt: Date.now(),
      });
      order.push([layer.id]);
      layerCount++;
    });

    // Template shape id -> the element id it became, so connectors can be resolved.
    const idMap = new Map();

    (canvasState.shapes || []).forEach((shape) => {
      const { id: templateId, ...rest } = shape;
      const elementId = newId('tpl');
      idMap.set(templateId, elementId);
      elements.set(elementId, {
        kind: KIND.SHAPE,
        smart: true,
        fromTemplate: true,
        templateShapeId: templateId,
        color: shape.color || '#f0ece4',
        lineWidth: shape.lineWidth || 2,
        layerId: shape.layerId || canvasState.layers?.[0]?.id || DEFAULT_LAYER_ID,
        seq: nextSeq(),
        timestamp: Date.now(),
        ...rest,
      });
      elementCount++;
    });

    /**
     * Connectors between template shapes.
     *
     * These were dropped entirely before: `createCanvasFromTemplate` returns an
     * `initialConnectors` array and nothing consumed it, so every flowchart template loaded
     * as a set of unconnected boxes — the boxes are the least interesting half of a
     * flowchart. Stored by ELEMENT id, not template id, so a connector survives independently
     * of the template it came from.
     */
    (canvasState.connectors || []).forEach((conn) => {
      const fromId = idMap.get(conn.from);
      const toId = idMap.get(conn.to);
      if (!fromId || !toId) return;
      elements.set(newId('conn'), {
        kind: KIND.CONNECTOR,
        fromId,
        toId,
        label: conn.label || null,
        color: '#55504a',
        width: 1,
        seq: nextSeq(),
        timestamp: Date.now(),
        layerId: canvasState.layers?.[1]?.id || canvasState.layers?.[0]?.id || DEFAULT_LAYER_ID,
      });
      elementCount++;
    });

    (canvasState.texts || []).forEach((t) => {
      const el = new Y.Map();
      const body = new Y.Text();
      body.insert(0, t.text || '');
      el.set('kind', KIND.TEXT);
      el.set('x', t.x);
      el.set('y', t.y);
      el.set('color', t.color || '#f0ece4');
      el.set('seq', nextSeq());
      el.set('layerId', t.layerId || DEFAULT_LAYER_ID);
      el.set('body', body);
      getElements(ydoc).set(newId('tpl-text'), el);
      elementCount++;
    });
  }, origin);

  return { layers: layerCount, elements: elementCount };
}
