/**
 * doc.js — the shared document model.
 *
 * These tests encode the modelling rules that keep a CRDT from melting, and the merge
 * behaviour that is the entire reason for choosing one. They run against real Y.Docs and
 * real update exchange, not mocks: the interesting failures here are convergence failures,
 * and a mock cannot have those.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  KIND,
  DEFAULT_LAYER_ID,
  getElements,
  readElements,
  readComments,
  readLayers,
  addStroke,
  addShape,
  addText,
  updateTextBody,
  deleteElement,
  addComment,
  resolveComment,
  ensureDefaultLayer,
  createLayer,
  updateLayer,
  deleteLayer,
  reorderLayers,
  setTextFormatting,
  placeSmartShape,
  addVideoEmbed,
  moveVideoEmbed,
  loadTemplate,
} from './doc.js';

const ORIGIN = Symbol('test');

/** Two docs wired together, exchanging updates the way two clients do through a server. */
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(b, u, 'remote'); });
  b.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(a, u, 'remote'); });
  return { a, b };
}

/** Two docs that are NOT connected, so their edits are genuinely concurrent. */
function split() {
  return { a: new Y.Doc(), b: new Y.Doc() };
}

function merge(a, b) {
  const ua = Y.encodeStateAsUpdate(a);
  const ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
}

/** Total CRDT operations in a doc: the state vector's clock, summed over every client. */
const opCount = (doc) =>
  [...Y.decodeStateVector(Y.encodeStateVector(doc)).values()].reduce((a, b) => a + b, 0);

describe('rule 1 — a stroke is ONE operation, not one per point', () => {
  it('produces a single map entry no matter how many points it has', () => {
    const doc = new Y.Doc();
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i * 2 }));
    addStroke(doc, ORIGIN, { points, color: '#f0ece4', width: 2, userId: 'u1' });

    expect(getElements(doc).size).toBe(1);
    expect(readElements(doc)[0].points).toHaveLength(500);
  });

  it('a 500-point stroke costs barely more than a 5-point one in document ops', () => {
    // The failure this guards against is one CRDT op per sampled point, which makes the
    // document grow without bound — CRDT history cannot be compacted away.
    const small = new Y.Doc();
    addStroke(small, ORIGIN, {
      points: Array.from({ length: 5 }, (_, i) => ({ x: i, y: i })), color: '#fff', width: 2,
    });
    const big = new Y.Doc();
    addStroke(big, ORIGIN, {
      points: Array.from({ length: 500 }, (_, i) => ({ x: i, y: i })), color: '#fff', width: 2,
    });

    // Count operations, not encoded bytes. A state vector's *length* is dominated by the
    // width of the doc's randomly-assigned clientID varint, so comparing lengths across two
    // independent docs fails ~8% of the time for reasons unrelated to op count. The clock a
    // state vector carries per client IS the op count, so decode it and compare that.
    expect(opCount(big)).toBe(opCount(small));
  });
});

describe('rule 2 — text uses Y.Text and merges character by character', () => {
  it('stores text as a Y.Map with a Y.Text body', () => {
    const doc = new Y.Doc();
    const id = addText(doc, ORIGIN, { text: 'hello', x: 1, y: 2, color: '#fff', userId: 'u' });
    const el = getElements(doc).get(id);
    expect(el).toBeInstanceOf(Y.Map);
    expect(el.get('body')).toBeInstanceOf(Y.Text);
    expect(readElements(doc)[0].text).toBe('hello');
  });

  it('MERGES concurrent edits to the same text instead of clobbering', () => {
    const { a, b } = pair();
    const id = addText(a, ORIGIN, { text: 'hello world', x: 0, y: 0, color: '#fff' });

    // Now disconnect and edit both ends concurrently.
    a.off('update', a._observers?.update);
    const solo = { a: new Y.Doc(), b: new Y.Doc() };
    Y.applyUpdate(solo.a, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(solo.b, Y.encodeStateAsUpdate(a));

    updateTextBody(solo.a, ORIGIN, id, 'HELLO world');   // edits the head
    updateTextBody(solo.b, ORIGIN, id, 'hello WORLD');   // edits the tail
    merge(solo.a, solo.b);

    const textA = readElements(solo.a)[0].text;
    const textB = readElements(solo.b)[0].text;
    expect(textA).toBe(textB);                    // converged
    expect(textA).toContain('HELLO');             // A's edit survived
    expect(textA).toContain('WORLD');             // and so did B's
    expect(b).toBeDefined();
  });

  it('updates by diffing — an unchanged edit is a no-op', () => {
    const doc = new Y.Doc();
    const id = addText(doc, ORIGIN, { text: 'same', x: 0, y: 0, color: '#fff' });
    const before = Y.encodeStateAsUpdate(doc).length;
    updateTextBody(doc, ORIGIN, id, 'same');
    expect(Y.encodeStateAsUpdate(doc).length).toBe(before);
  });

  it('applies a prefix edit without rewriting the untouched tail', () => {
    const doc = new Y.Doc();
    const id = addText(doc, ORIGIN, { text: 'abcdef', x: 0, y: 0, color: '#fff' });
    updateTextBody(doc, ORIGIN, id, 'Xbcdef');
    expect(readElements(doc)[0].text).toBe('Xbcdef');
  });
});

describe('rule 4 — ordering is explicit', () => {
  it('returns elements sorted by seq, not by map iteration order', () => {
    const doc = new Y.Doc();
    const ids = [];
    for (let i = 0; i < 8; i++) {
      ids.push(addStroke(doc, ORIGIN, { points: [{ x: i, y: i }], color: '#fff', width: 1 }));
    }
    const seqs = readElements(doc).map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
  });
});

describe('rule 5 — the Map key is the id', () => {
  it('a stored id field never shadows the authoritative key', () => {
    // This regressed once: readElements spread the value over the key, so a video embed
    // that carried its own `id` came back with id undefined. React saw duplicate keys and
    // move/remove by id silently could not work.
    const doc = new Y.Doc();
    const id = addVideoEmbed(doc, ORIGIN, {
      id: 'wanted-id', type: 'youtube', url: 'x', x: 0, y: 0, width: 100, height: 60,
    });
    const el = readElements(doc)[0];
    expect(id).toBe('wanted-id');
    expect(el.id).toBe('wanted-id');
    expect(el.id).toBeDefined();
  });

  it('every element reads back with a defined id', () => {
    const doc = new Y.Doc();
    addStroke(doc, ORIGIN, { points: [{ x: 0, y: 0 }], color: '#fff', width: 1 });
    addShape(doc, ORIGIN, { type: 'rectangle', points: [], color: '#fff', width: 1 });
    addText(doc, ORIGIN, { text: 't', x: 0, y: 0, color: '#fff' });
    addVideoEmbed(doc, ORIGIN, { type: 'file', x: 0, y: 0 });
    placeSmartShape(doc, ORIGIN, { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 });

    const els = readElements(doc);
    expect(els).toHaveLength(5);
    for (const el of els) expect(el.id).toBeTruthy();
    expect(new Set(els.map((e) => e.id)).size).toBe(5);
  });
});

describe('convergence — the reason for choosing a CRDT', () => {
  it('two clients drawing at the same time keep BOTH strokes', () => {
    const { a, b } = split();
    addStroke(a, ORIGIN, { points: [{ x: 0, y: 0 }], color: '#aaa', width: 1, userId: 'a' });
    addStroke(b, ORIGIN, { points: [{ x: 9, y: 9 }], color: '#bbb', width: 1, userId: 'b' });
    merge(a, b);

    expect(readElements(a)).toHaveLength(2);
    expect(readElements(b)).toHaveLength(2);
    expect(readElements(a).map((e) => e.id).sort())
      .toEqual(readElements(b).map((e) => e.id).sort());
  });

  it('a delete on one side and an edit on the other converge to the same result', () => {
    const { a, b } = split();
    const id = addStroke(a, ORIGIN, { points: [{ x: 1, y: 1 }], color: '#fff', width: 1 });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    deleteElement(a, ORIGIN, id);
    addStroke(b, ORIGIN, { points: [{ x: 2, y: 2 }], color: '#fff', width: 1 });
    merge(a, b);

    expect(readElements(a).map((e) => e.id)).toEqual(readElements(b).map((e) => e.id));
  });
});

describe('layers', () => {
  it('creates a default layer lazily, and only once', () => {
    const doc = new Y.Doc();
    expect(readLayers(doc)).toHaveLength(0);
    ensureDefaultLayer(doc, ORIGIN);
    ensureDefaultLayer(doc, ORIGIN);
    expect(readLayers(doc)).toHaveLength(1);
    expect(readLayers(doc)[0].id).toBe(DEFAULT_LAYER_ID);
  });

  it('DELETES a layer together with everything drawn on it', () => {
    // Orphaning the elements would leave ink no layer control can reach: invisible to the
    // panel, still rendered, impossible to remove.
    const doc = new Y.Doc();
    ensureDefaultLayer(doc, ORIGIN);
    const layerId = createLayer(doc, ORIGIN, 'Scratch');

    addStroke(doc, ORIGIN, { points: [{ x: 0, y: 0 }], color: '#fff', width: 1, layerId });
    addStroke(doc, ORIGIN, { points: [{ x: 1, y: 1 }], color: '#fff', width: 1, layerId });
    addStroke(doc, ORIGIN, {
      points: [{ x: 2, y: 2 }], color: '#fff', width: 1, layerId: DEFAULT_LAYER_ID,
    });
    expect(readElements(doc)).toHaveLength(3);

    deleteLayer(doc, ORIGIN, layerId);
    expect(readLayers(doc).map((l) => l.id)).toEqual([DEFAULT_LAYER_ID]);
    expect(readElements(doc)).toHaveLength(1);
    expect(readElements(doc)[0].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it('refuses to delete the default layer', () => {
    const doc = new Y.Doc();
    ensureDefaultLayer(doc, ORIGIN);
    deleteLayer(doc, ORIGIN, DEFAULT_LAYER_ID);
    expect(readLayers(doc)).toHaveLength(1);
  });

  it('reorders atomically', () => {
    const doc = new Y.Doc();
    ensureDefaultLayer(doc, ORIGIN);
    const l1 = createLayer(doc, ORIGIN, 'One');
    const l2 = createLayer(doc, ORIGIN, 'Two');
    reorderLayers(doc, ORIGIN, [l2, l1, DEFAULT_LAYER_ID]);
    expect(readLayers(doc).map((l) => l.id)).toEqual([l2, l1, DEFAULT_LAYER_ID]);
  });

  it('updates a layer without dropping its other fields', () => {
    const doc = new Y.Doc();
    ensureDefaultLayer(doc, ORIGIN);
    const id = createLayer(doc, ORIGIN, 'Named');
    updateLayer(doc, ORIGIN, id, { visible: false });
    const layer = readLayers(doc).find((l) => l.id === id);
    expect(layer.visible).toBe(false);
    expect(layer.name).toBe('Named');
  });
});

describe('templates', () => {
  const TEMPLATE = {
    layers: [{ id: 'tpl-shapes', name: 'Shapes', visible: true }],
    shapes: [
      { id: 's1', type: 'rectangle', x: 0, y: 0, width: 80, height: 40, label: 'Start' },
      { id: 's2', type: 'rectangle', x: 200, y: 0, width: 80, height: 40, label: 'End' },
    ],
    connectors: [{ id: 'c1', from: 's1', to: 's2', label: 'next' }],
    texts: [],
  };

  it('is ADDITIVE — it never destroys existing work', () => {
    // The previous behaviour replaced the canvas outright, which on a shared board silently
    // deletes everyone else's drawing.
    const doc = new Y.Doc();
    ensureDefaultLayer(doc, ORIGIN);
    addStroke(doc, ORIGIN, { points: [{ x: 5, y: 5 }], color: '#fff', width: 1, userId: 'someone' });

    loadTemplate(doc, ORIGIN, TEMPLATE);

    const strokes = readElements(doc).filter((e) => e.kind === KIND.STROKE);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].userId).toBe('someone');
  });

  it('resolves connectors to the ELEMENT ids the shapes became', () => {
    const doc = new Y.Doc();
    loadTemplate(doc, ORIGIN, TEMPLATE);

    const els = readElements(doc);
    const conn = els.find((e) => e.kind === KIND.CONNECTOR);
    expect(conn).toBeDefined();
    expect(conn.label).toBe('next');

    // Both endpoints must point at elements that actually exist, or the connector renders
    // as nothing — which is what happened when connectors were dropped entirely.
    const ids = new Set(els.map((e) => e.id));
    expect(ids.has(conn.fromId)).toBe(true);
    expect(ids.has(conn.toId)).toBe(true);
    expect(conn.fromId).not.toBe(conn.toId);
  });

  it('loads as ONE transaction, so a single undo reverses the whole template', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager(getElements(doc), { trackedOrigins: new Set([ORIGIN]) });
    loadTemplate(doc, ORIGIN, TEMPLATE);
    expect(readElements(doc).length).toBeGreaterThan(2);

    undo.undo();
    expect(readElements(doc)).toHaveLength(0);
  });

  it('reports what it added', () => {
    const doc = new Y.Doc();
    const added = loadTemplate(doc, ORIGIN, TEMPLATE);
    expect(added.layers).toBe(1);
    expect(added.elements).toBe(3);   // 2 shapes + 1 connector
  });
});

describe('comments and formatting', () => {
  it('stores and resolves a comment', () => {
    const doc = new Y.Doc();
    const id = addComment(doc, ORIGIN, { elementId: 'e1', text: 'look here', author: 'u' });
    expect(readComments(doc)[0].resolved).toBe(false);
    resolveComment(doc, ORIGIN, id);
    expect(readComments(doc)[0].resolved).toBe(true);
  });

  it('merges formatting changes rather than replacing the whole object', () => {
    const doc = new Y.Doc();
    const id = addText(doc, ORIGIN, { text: 'x', x: 0, y: 0, color: '#fff' });
    setTextFormatting(doc, ORIGIN, id, { bold: true });
    setTextFormatting(doc, ORIGIN, id, { fontSize: 24 });
    const f = readElements(doc)[0].formatting;
    expect(f.bold).toBe(true);
    expect(f.fontSize).toBe(24);
  });
});

describe('video embeds', () => {
  it('moves by id', () => {
    const doc = new Y.Doc();
    const id = addVideoEmbed(doc, ORIGIN, { type: 'file', x: 0, y: 0, width: 10, height: 10 });
    moveVideoEmbed(doc, ORIGIN, id, 55, 66);
    const el = readElements(doc)[0];
    expect(el.x).toBe(55);
    expect(el.y).toBe(66);
  });

  it('ignores a move for an element that is not a video', () => {
    const doc = new Y.Doc();
    const id = addStroke(doc, ORIGIN, { points: [{ x: 0, y: 0 }], color: '#fff', width: 1 });
    moveVideoEmbed(doc, ORIGIN, id, 5, 5);
    expect(readElements(doc)[0].x).toBeUndefined();
  });
});

describe('undo is scoped to its own origin', () => {
  it('does not undo another client\'s work', () => {
    // The old server-side undo popped one shared stack, so Ctrl+Z could remove a stroke
    // somebody else had just drawn.
    const doc = new Y.Doc();
    const mine = Symbol('mine');
    const theirs = Symbol('theirs');
    const undo = new Y.UndoManager(getElements(doc), { trackedOrigins: new Set([mine]) });

    addStroke(doc, theirs, { points: [{ x: 0, y: 0 }], color: '#fff', width: 1, userId: 'them' });
    addStroke(doc, mine, { points: [{ x: 1, y: 1 }], color: '#fff', width: 1, userId: 'me' });
    expect(readElements(doc)).toHaveLength(2);

    undo.undo();
    const left = readElements(doc);
    expect(left).toHaveLength(1);
    expect(left[0].userId).toBe('them');
  });
});
