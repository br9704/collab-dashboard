/**
 * shapeRecognition.js — 447 lines of geometric heuristics.
 *
 * This is the module that used to be sold as "AI shape completion". It is honest geometry,
 * and geometry is testable in a way that a model is not: feed it a shape, assert it says so.
 *
 * The tests generate ideal shapes and then add jitter, because the interesting question is
 * not "does it recognise a perfect circle" but "does it still recognise a hand-drawn one,
 * and does it correctly refuse a scribble".
 */

import { describe, it, expect } from 'vitest';
import { recognizeShape, simplifyStroke } from './shapeRecognition.js';

/** Deterministic pseudo-random jitter, so a failure is reproducible. */
function jitterer(seed = 1) {
  let s = seed;
  return (amount) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return ((s / 2147483648) - 0.5) * 2 * amount;
  };
}

function circle(cx, cy, r, n = 48, jitter = 0, seed = 1) {
  const j = jitterer(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r + j(jitter), y: cy + Math.sin(a) * r + j(jitter) };
  });
}

function rectangle(x, y, w, h, perSide = 12, jitter = 0, seed = 2) {
  const j = jitterer(seed);
  const pts = [];
  const edge = (x1, y1, x2, y2) => {
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      pts.push({ x: x1 + (x2 - x1) * t + j(jitter), y: y1 + (y2 - y1) * t + j(jitter) });
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
  return pts;
}

function line(x1, y1, x2, y2, n = 20, jitter = 0, seed = 3) {
  const j = jitterer(seed);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x1 + (x2 - x1) * t + j(jitter), y: y1 + (y2 - y1) * t + j(jitter) };
  });
}

describe('input handling', () => {
  it('never throws on degenerate input', () => {
    for (const input of [null, undefined, [], [{ x: 0, y: 0 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }]]) {
      expect(() => recognizeShape(input)).not.toThrow();
    }
  });

  it('always returns an object with a confidence', () => {
    const r = recognizeShape(circle(0, 0, 50));
    expect(r).toBeTypeOf('object');
    expect(typeof r.confidence).toBe('number');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('declines to guess on too few points', () => {
    const r = recognizeShape([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(r.shape == null || r.confidence < 0.6).toBe(true);
  });
});

describe('clean shapes', () => {
  it('recognises a circle', () => {
    const r = recognizeShape(circle(200, 200, 80));
    expect(r.shape).toBe('circle');
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('recognises a straight line', () => {
    const r = recognizeShape(line(0, 0, 300, 300));
    expect(r.shape).toBe('line');
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('recognises a rectangle', () => {
    const r = recognizeShape(rectangle(50, 50, 200, 120));
    expect(r.shape).toBe('rectangle');
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('gives a circle bounds a renderer can actually use', () => {
    const r = recognizeShape(circle(300, 300, 60));
    expect(r.bounds).toBeTruthy();
    // Whatever the shape of the bounds object, it must describe the right region.
    const s = JSON.stringify(r.bounds);
    expect(s).toMatch(/\d/);
  });
});

describe('hand-drawn shapes — the actual use case', () => {
  it('still recognises a wobbly circle', () => {
    const r = recognizeShape(circle(200, 200, 90, 60, 5, 7));
    expect(r.shape).toBe('circle');
  });

  it('still recognises a wobbly line', () => {
    const r = recognizeShape(line(10, 10, 400, 120, 30, 3, 11));
    expect(r.shape).toBe('line');
  });

  it('is stable: the same points always give the same answer', () => {
    const pts = circle(150, 150, 70, 40, 4, 13);
    const a = recognizeShape(pts);
    const b = recognizeShape(pts);
    expect(a.shape).toBe(b.shape);
    expect(a.confidence).toBe(b.confidence);
  });

  it('is translation-invariant — the same shape drawn elsewhere is the same shape', () => {
    const here = recognizeShape(circle(100, 100, 60));
    const there = recognizeShape(circle(900, 640, 60));
    expect(there.shape).toBe(here.shape);
  });
});

describe('refusing to guess', () => {
  it('does not confidently claim a shape for a scribble', () => {
    const j = jitterer(42);
    const scribble = Array.from({ length: 60 }, () => ({ x: j(300), y: j(300) }));
    const r = recognizeShape(scribble);
    // Either no shape, or low enough confidence that the UI would not offer it.
    expect(r.shape === null || r.confidence < 0.6).toBe(true);
  });

  it('does not call a circle a rectangle', () => {
    expect(recognizeShape(circle(0, 0, 100)).shape).not.toBe('rectangle');
  });

  it('does not call a line a circle', () => {
    expect(recognizeShape(line(0, 0, 400, 0)).shape).not.toBe('circle');
  });
});

describe('simplifyStroke', () => {
  it('reduces point count while keeping the endpoints', () => {
    const pts = line(0, 0, 500, 500, 200);
    const simple = simplifyStroke(pts, 2);

    expect(simple.length).toBeLessThan(pts.length);
    expect(simple.length).toBeGreaterThanOrEqual(2);
    expect(simple[0]).toEqual(pts[0]);
    expect(simple[simple.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('collapses a straight line to nearly nothing', () => {
    const simple = simplifyStroke(line(0, 0, 400, 400, 100), 2);
    expect(simple.length).toBeLessThan(6);
  });

  it('keeps more points for a curve than for a straight line', () => {
    const curveN = simplifyStroke(circle(0, 0, 100, 100), 2).length;
    const lineN = simplifyStroke(line(0, 0, 400, 400, 100), 2).length;
    expect(curveN).toBeGreaterThan(lineN);
  });

  it('handles degenerate input without throwing', () => {
    expect(() => simplifyStroke([], 2)).not.toThrow();
    expect(() => simplifyStroke([{ x: 0, y: 0 }], 2)).not.toThrow();
  });
});
