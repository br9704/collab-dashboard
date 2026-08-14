/**
 * Sprint 1 gate — the real thing: two browser windows, one board.
 *
 * Asserts what CLAUDE.md demands as evidence: "two browser windows drawing together".
 * Captures console errors from both windows, screenshots each, and reports.
 */
const { chromium } = require('playwright');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const OUT = __dirname;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

(async () => {
  const browser = await chromium.launch();

  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const errorsA = [];
  const errorsB = [];
  const netFailA = [];
  A.on('console', (m) => m.type() === 'error' && errorsA.push(m.text()));
  B.on('console', (m) => m.type() === 'error' && errorsB.push(m.text()));
  A.on('response', (r) => { if (r.status() >= 400) netFailA.push(`${r.status()} ${r.url()}`); });

  // ── A creates a session ────────────────────────────────────────────────
  await A.goto(APP, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: /Create a new whiteboard session/i }).click();
  await A.waitForSelector('.drawing-canvas', { timeout: 10000 });
  await A.waitForTimeout(500);

  // The badge is uppercased by CSS; compare case-insensitively.
  const roleA = (await A.locator('.role-badge').innerText()).trim().toLowerCase();
  check('creator is not a viewer', roleA === 'creator', `role badge reads "${roleA}"`);

  const viewOnlyVisible = await A.locator('.view-only-overlay').count();
  check('no View Only overlay for the creator', viewOnlyVisible === 0,
    `overlay elements=${viewOnlyVisible}`);

  const onlineA1 = (await A.locator('.user-list h3').innerText()).trim();
  check('presence counts the creator', /\(1\)/.test(onlineA1), `panel reads "${onlineA1}"`);

  // Grab the session id from the sidebar so B can join — this is exactly what a real user
  // has to do, so the id must be present in full in the DOM.
  const joinId = await A.locator('#session-id-value').getAttribute('data-session-id');
  const shownId = (await A.locator('#session-id-value').innerText()).trim();
  check('session id is shown in full, not truncated',
    !!joinId && shownId === joinId && !shownId.includes('…'),
    `shown="${shownId}"`);

  // ── B joins ────────────────────────────────────────────────────────────
  await B.goto(APP, { waitUntil: 'networkidle' });
  await B.getByLabel(/Session ID input/i).fill(joinId);
  await B.getByRole('button', { name: /Join the session/i }).click();
  await B.waitForSelector('.drawing-canvas', { timeout: 10000 });
  await B.waitForTimeout(800);

  const onlineB = (await B.locator('.user-list h3').innerText()).trim();
  check('joiner sees both users', /\(2\)/.test(onlineB), `panel reads "${onlineB}"`);

  await A.waitForTimeout(400);
  const onlineA2 = (await A.locator('.user-list h3').innerText()).trim();
  check('creator sees both users', /\(2\)/.test(onlineA2), `panel reads "${onlineA2}"`);

  const roleB = (await B.locator('.role-badge').innerText()).trim().toLowerCase();
  check('joiner is a viewer', roleB === 'viewer', `role badge reads "${roleB}"`);

  // ── A draws; B must see it ─────────────────────────────────────────────
  const box = await A.locator('.drawing-canvas').boundingBox();
  await A.mouse.move(box.x + 200, box.y + 200);
  await A.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await A.mouse.move(box.x + 200 + i * 12, box.y + 200 + Math.sin(i / 3) * 40);
    await A.waitForTimeout(12);
  }
  await A.mouse.up();
  await A.waitForTimeout(600);

  const strokesB = await B.evaluate(() => window.__strokeCountForTest ?? -1);
  // Fall back to a pixel check: is there any non-white ink on B's canvas?
  const inkOnB = await B.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    // Ink = anything brighter than the warm-black board (#050505).
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) nonBg++;
    }
    return nonBg;
  });
  check("the other window renders the creator's stroke", inkOnB > 200,
    `${inkOnB} non-background pixels on B`);

  // ── B moves its mouse; A must render a remote cursor ───────────────────
  const boxB = await B.locator('.drawing-canvas').boundingBox();
  for (let i = 0; i < 12; i++) {
    await B.mouse.move(boxB.x + 300 + i * 15, boxB.y + 400);
    await B.waitForTimeout(40);
  }
  await A.waitForTimeout(500);
  const cursorsOnA = await A.locator('.cursor').count();
  check('remote cursor is rendered', cursorsOnA >= 1, `${cursorsOnA} remote cursor(s) on A`);

  const cursorMoved = await A.evaluate(() => {
    const el = document.querySelector('.cursor');
    return el ? getComputedStyle(el).transform : null;
  });
  check('remote cursor is positioned by transform', !!cursorMoved && cursorMoved !== 'none',
    `transform=${cursorMoved}`);

  // ── Undo must remove the ink in BOTH windows ───────────────────────────
  await A.keyboard.press('Control+z');
  await A.waitForTimeout(700);

  const inkAfterUndoA = await A.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    // Ink = anything brighter than the warm-black board (#050505).
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) nonBg++;
    }
    return nonBg;
  });
  const inkAfterUndoB = await B.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    // Ink = anything brighter than the warm-black board (#050505).
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) nonBg++;
    }
    return nonBg;
  });
  check('undo removes the ink in the drawing window', inkAfterUndoA < 200,
    `${inkAfterUndoA} non-background pixels remain on A`);
  check('undo removes the ink in the other window', inkAfterUndoB < 200,
    `${inkAfterUndoB} non-background pixels remain on B`);

  // ── Console cleanliness ────────────────────────────────────────────────
  check('no console errors in window A', errorsA.length === 0, errorsA.join(' | ') || 'clean');
  check('no console errors in window B', errorsB.length === 0, errorsB.join(' | ') || 'clean');
  check('no failed network requests (the favicon 404)', netFailA.length === 0,
    netFailA.join(' | ') || 'clean');

  await A.screenshot({ path: path.join(OUT, 'window-a.png') });
  await B.screenshot({ path: path.join(OUT, 'window-b.png') });

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
