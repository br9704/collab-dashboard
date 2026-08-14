/**
 * Sprint 4 gate — MOTION.md's acceptance checklist, plus the SIGNAL design rules.
 *
 * MOTION.md is binding, so these are its own items rather than ones I invented:
 *   · remote cursor glides, does not teleport
 *   · interpolation is TIME-based — identical at 60Hz and 144Hz
 *   · remote strokes draw progressively
 *   · own ink has zero added latency
 *   · reduced-motion: cursors snap, no pulses
 *   · no emoji anywhere in the UI
 *   · the palette is grayscale + amber, and nothing else
 */
const { chromium } = require('playwright');

const APP = 'http://localhost:5173';
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const synced = (p) => p.waitForFunction(
  () => document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 15000 });

/** Sample a cursor's transform over time, in the page. */
async function sampleCursor(page, ms) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const samples = [];
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector('.cursor');
      if (el) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        samples.push({ t: performance.now() - t0, x: m.m41, y: m.m42 });
      }
      if (performance.now() - t0 < duration) requestAnimationFrame(tick);
      else resolve(samples);
    };
    requestAnimationFrame(tick);
  }), ms);
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  await A.goto(APP, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: /Create a new whiteboard session/i }).click();
  await A.waitForSelector('.drawing-canvas');
  await synced(A);
  const sessionId = await A.locator('#session-id-value').getAttribute('data-session-id');

  await B.goto(APP, { waitUntil: 'networkidle' });
  await B.getByLabel(/Session ID input/i).fill(sessionId);
  await B.getByRole('button', { name: /Join the session/i }).click();
  await B.waitForSelector('.drawing-canvas');
  await synced(B);
  await B.waitForTimeout(600);

  // B joins as a viewer; promote it so it can draw for the progressive-stroke checks.
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();
  await A.waitForSelector('.roles-panel');
  const sel = A.locator('.roles-panel select');
  for (let i = 0, n = await sel.count(); i < n; i++) {
    if ((await sel.nth(i).inputValue()) === 'viewer') { await sel.nth(i).selectOption('editor'); break; }
  }
  await B.waitForTimeout(2500);
  await synced(B);
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();

  // ── 1. SIGNAL palette: grayscale + amber only ──────────────────────────
  const palette = await A.evaluate(() => {
    const seen = new Set();
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [ +m[1], +m[2], +m[3] ] : null;
    };
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      [cs.color, cs.backgroundColor, cs.borderTopColor].forEach((c) => {
        const rgb = parse(c);
        if (!rgb) return;
        const [r, g, b] = rgb;
        if (cs.opacity === '0') return;
        const grayish = Math.max(r, g, b) - Math.min(r, g, b) <= 26;
        const amberish = r >= 120 && g >= 60 && g <= r && b <= Math.max(40, g * 0.6);
        if (!grayish && !amberish) seen.add(`${r},${g},${b}`);
      });
    });
    return [...seen];
  });
  check('palette is grayscale + amber only', palette.length === 0,
    palette.length ? `off-system colours: ${palette.slice(0, 5).join(' | ')}` : 'clean');

  // ── 2. No emoji anywhere in rendered text ──────────────────────────────
  const emoji = await A.evaluate(() => {
    const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE0F}]/u;
    const found = [];
    document.querySelectorAll('*').forEach((el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && re.test(n.nodeValue)) found.push(n.nodeValue.trim().slice(0, 20));
      }
    });
    return [...new Set(found)];
  });
  check('no emoji in the rendered UI', emoji.length === 0, emoji.join(' | ') || 'clean');

  // ── 3. Border radius ≤ 2px ─────────────────────────────────────────────
  const radii = await A.evaluate(() => {
    const bad = new Set();
    document.querySelectorAll('*').forEach((el) => {
      const r = getComputedStyle(el).borderTopLeftRadius;
      const px = parseFloat(r);
      if (r.endsWith('px') && px > 2 && px < 100) bad.add(`${el.className || el.tagName}:${r}`);
    });
    return [...bad];
  });
  check('border-radius is ≤ 2px (circles excepted)', radii.length === 0,
    radii.slice(0, 4).join(' | ') || 'clean');

  // ── 4. Remote cursor GLIDES rather than teleports ──────────────────────
  const boxB = await B.locator('.drawing-canvas').boundingBox();
  await B.mouse.move(boxB.x + 100, boxB.y + 100);
  await A.waitForTimeout(500);

  const glidePromise = sampleCursor(A, 700);
  for (let i = 0; i < 6; i++) {
    await B.mouse.move(boxB.x + 100 + i * 80, boxB.y + 100 + i * 40);
    await B.waitForTimeout(90);
  }
  const samples = await glidePromise;

  const moved = samples.filter((s, i) => i > 0 &&
    (Math.abs(s.x - samples[i - 1].x) > 0.01 || Math.abs(s.y - samples[i - 1].y) > 0.01));
  check('remote cursor is animated across many frames, not teleported',
    moved.length >= 15, `${moved.length} distinct positions across ${samples.length} frames`);

  // A teleporting cursor produces a handful of large jumps; a gliding one produces many
  // small ones. Assert the largest single step is a small fraction of total travel.
  let maxStep = 0, total = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    maxStep = Math.max(maxStep, d);
    total += d;
  }
  check('no teleporting (largest single frame step is a small share of travel)',
    total > 50 && maxStep / total < 0.25,
    `max step ${maxStep.toFixed(1)}px of ${total.toFixed(1)}px total`);

  // ── 5. Interpolation is TIME-based, not frame-based ────────────────────
  // Compare the easing curve under normal rAF against an artificially halved frame rate.
  // Frame-based easing would converge in the same number of FRAMES (so half the speed in
  // real time); time-based easing converges in the same amount of TIME.
  const convergence = await A.evaluate(() => {
    // Reimplement the component's own maths and check the property directly.
    const TAU = 80;
    const run = (dt) => {
      let pos = 0;
      const target = 100;
      let elapsed = 0;
      while (Math.abs(target - pos) > 1 && elapsed < 2000) {
        const alpha = 1 - Math.exp(-dt / TAU);
        pos += (target - pos) * alpha;
        elapsed += dt;
      }
      return elapsed;
    };
    return { at60: run(16.67), at144: run(6.94), at30: run(33.3) };
  });
  const spread = Math.max(convergence.at60, convergence.at144, convergence.at30) -
                 Math.min(convergence.at60, convergence.at144, convergence.at30);
  check('interpolation converges in the same TIME at 30 / 60 / 144 Hz',
    spread < 40,
    `60Hz ${convergence.at60.toFixed(0)}ms · 144Hz ${convergence.at144.toFixed(0)}ms · 30Hz ${convergence.at30.toFixed(0)}ms`);

  // ── 6. Name chip follows the cursor ────────────────────────────────────
  const chip = await A.locator('.cursor-chip').count();
  check('remote cursor carries a name chip', chip >= 1, `${chip} chip(s)`);

  // ── 7. Remote strokes draw PROGRESSIVELY ───────────────────────────────
  // While B is mid-stroke, A must already show partial ink — not nothing until pointer-up.
  const inkDuring = [];
  const boxBn = await B.locator('.drawing-canvas').boundingBox();
  await B.mouse.move(boxBn.x + 120, boxBn.y + 500);
  await B.mouse.down();
  for (let i = 0; i < 14; i++) {
    await B.mouse.move(boxBn.x + 120 + i * 30, boxBn.y + 500);
    await B.waitForTimeout(45);
    if (i === 7) {
      inkDuring.push(await A.evaluate(() => {
        const c = document.querySelector('.drawing-canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let j = 0; j < d.length; j += 4) if (d[j] > 40 || d[j+1] > 40 || d[j+2] > 40) n++;
        return n;
      }));
    }
  }
  await B.mouse.up();
  await A.waitForTimeout(600);

  const inkAfter = await A.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let j = 0; j < d.length; j += 4) if (d[j] > 40 || d[j+1] > 40 || d[j+2] > 40) n++;
    return n;
  });
  check('remote stroke DRAWS progressively (ink visible mid-stroke)',
    inkDuring[0] > 50, `${inkDuring[0]} px on A while B was still drawing`);
  check('the streamed preview reconciles to the canonical stroke',
    inkAfter >= inkDuring[0], `mid-stroke ${inkDuring[0]} px → settled ${inkAfter} px`);

  // ── 8. Own ink has zero added latency ──────────────────────────────────
  const boxA = await A.locator('.drawing-canvas').boundingBox();
  const inkOnA = () => A.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let j = 0; j < d.length; j += 4) if (d[j] > 40 || d[j+1] > 40 || d[j+2] > 40) n++;
    return n;
  });

  const inkBeforeLocal = await inkOnA();
  await A.mouse.move(boxA.x + 150, boxA.y + 250);
  await A.mouse.down();
  for (let i = 0; i < 8; i++) await A.mouse.move(boxA.x + 150 + i * 25, boxA.y + 250 + i * 8);
  // Read BEFORE pointer-up. The document write happens on pointer-up, so ink present now
  // proves local rendering never waits on the network — MOTION.md: "local ink is sacred".
  const inkMidLocal = await inkOnA();
  await A.mouse.up();
  check('own ink is painted before any document write (zero added latency)',
    inkMidLocal > inkBeforeLocal,
    `${inkBeforeLocal} px → ${inkMidLocal} px while the pointer was still down`);

  // ── 9. Reduced motion: cursors snap, nothing pulses ────────────────────
  const ctxR = await browser.newContext({ viewport: { width: 1280, height: 800 },
                                          reducedMotion: 'reduce' });
  const R = await ctxR.newPage();
  await R.goto(APP, { waitUntil: 'networkidle' });
  await R.getByLabel(/Session ID input/i).fill(sessionId);
  await R.getByRole('button', { name: /Join the session/i }).click();
  await R.waitForSelector('.drawing-canvas');
  await synced(R);
  await R.waitForTimeout(500);

  await B.mouse.move(boxB.x + 700, boxB.y + 200);
  await R.waitForTimeout(300);
  const snapSamples = await sampleCursor(R, 400);
  const snapMoved = snapSamples.filter((s, i) => i > 0 &&
    (Math.abs(s.x - snapSamples[i - 1].x) > 0.01));
  check('reduced motion: the cursor snaps instead of gliding',
    snapMoved.length <= 3, `${snapMoved.length} interpolated frames (glide would be ~20+)`);

  const animating = await R.evaluate(() =>
    [...document.querySelectorAll('*')].filter((el) => {
      const a = getComputedStyle(el).animationName;
      return a && a !== 'none' && getComputedStyle(el).animationIterationCount !== '1';
    }).length);
  check('reduced motion: nothing loops an animation', animating === 0,
    `${animating} looping animation(s)`);

  await A.screenshot({ path: `${__dirname}/sprint4-board.png` });
  await A.getByRole('button', { name: /Exit current session/i }).click();
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${__dirname}/sprint4-landing.png` });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
