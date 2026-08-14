/**
 * THE DEMO — MOTION.md's shot list, recorded.
 *
 *   "The README's two-window GIF showcases: join ring → live cursors → progressive stroke
 *    → shape snap → resolved comment. That GIF is the marketing; storyboard it, then record it."
 *
 * Recorded from the CREATOR's window, so the viewer watches someone else arrive and work.
 * Everything visible is real: a second browser is genuinely driving the other side over a
 * real socket, and nothing here is staged or sped up.
 *
 * Deliberate pacing. The beats are slow enough to read, because a whiteboard demo that
 * flickers past communicates nothing — and MOTION.md's whole argument is that the motion IS
 * the product.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP = process.env.APP_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'recording');
const W = 1000;
const H = 640;

const beat = (page, ms) => page.waitForTimeout(ms);

/** Move the mouse along a path, in steps, so the motion is genuinely animated. */
async function glide(page, from, to, steps = 26, pause = 16) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // ease-out, so the pointer decelerates like a hand rather than tracking linearly
    const e = 1 - Math.pow(1 - t, 3);
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(pause);
  }
}

async function drawPath(page, points, pause = 20) {
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(pause);
  }
  await page.mouse.up();
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();

  // Only the creator's context records — the GIF is one window's point of view.
  const ctxA = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  const ctxB = await browser.newContext({ viewport: { width: W, height: H } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const synced = (p) => p.waitForFunction(
    () => document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 20000 });

  // ── SHOT 0 · the landing screen, then a board ──────────────────────────
  await A.goto(APP, { waitUntil: 'networkidle' });
  await beat(A, 1400);
  await A.getByRole('button', { name: /Create a new whiteboard session/i }).click();
  await A.waitForSelector('.drawing-canvas');
  await synced(A);
  await beat(A, 900);

  const sessionId = await A.locator('#session-id-value').getAttribute('data-session-id');
  const box = await A.locator('.drawing-canvas').boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // A little of the creator's own ink first, so the board is not empty when the guest lands.
  await A.mouse.move(at(0.2, 0.35).x, at(0.2, 0.35).y);
  await drawPath(A, [
    at(0.18, 0.30), at(0.24, 0.24), at(0.32, 0.22), at(0.40, 0.26), at(0.44, 0.34),
  ], 34);
  await beat(A, 1600);   // let the recognition chip appear and settle

  // ── SHOT 1 · JOIN RING — someone else arrives ──────────────────────────
  await B.goto(APP, { waitUntil: 'networkidle' });
  await B.getByLabel(/Session ID input/i).fill(sessionId);
  await B.getByRole('button', { name: /Join the session/i }).click();
  await B.waitForSelector('.drawing-canvas');
  await synced(B);
  await beat(A, 1600);   // the join toast and the ONLINE count changing

  // Promote them, so the role toast shows and they can draw.
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();
  await A.waitForSelector('.roles-panel');
  const sel = A.locator('.roles-panel select');
  for (let i = 0, n = await sel.count(); i < n; i++) {
    if ((await sel.nth(i).inputValue()) === 'viewer') { await sel.nth(i).selectOption('editor'); break; }
  }
  await beat(A, 1800);
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();
  await synced(B);
  await beat(A, 700);

  // ── SHOT 2 · LIVE CURSORS — their pointer glides across the creator's screen ──
  await glide(B, at(0.62, 0.20), at(0.78, 0.55), 30, 18);
  await glide(B, at(0.78, 0.55), at(0.58, 0.66), 24, 18);
  await beat(A, 700);

  // ── SHOT 3 · PROGRESSIVE STROKE — their line DRAWS, it does not appear ──
  await drawPath(B, [
    at(0.56, 0.70), at(0.60, 0.62), at(0.65, 0.58), at(0.70, 0.60), at(0.74, 0.66),
    at(0.78, 0.72), at(0.82, 0.70), at(0.86, 0.62),
  ], 55);
  await beat(A, 1500);

  // ── SHOT 4 · SHAPE SNAP — a rough circle becomes a clean one ───────────
  const c = at(0.32, 0.62);
  const r = Math.min(box.width, box.height) * 0.11;
  const circlePts = Array.from({ length: 26 }, (_, i) => {
    const ang = (i / 25) * Math.PI * 2 - Math.PI / 2;
    // deliberately wobbly: this is a hand-drawn circle, not a generated one
    const wobble = 1 + Math.sin(i * 1.7) * 0.05;
    return { x: c.x + Math.cos(ang) * r * wobble, y: c.y + Math.sin(ang) * r * wobble };
  });
  await drawPath(A, circlePts, 26);
  await beat(A, 1600);            // the "looks like a circle — keep?" chip appears

  // Accept it explicitly. Auto-keep only applies above the confident threshold — below it,
  // taking the recognition is a deliberate click, because accepting REPLACES the stroke and
  // silence should never cost you your drawing.
  const keep = A.locator('.suggestion-accept');
  if (await keep.count()) {
    await keep.click();
    await beat(A, 1800);          // the snap
  } else {
    await beat(A, 2600);
  }

  // ── SHOT 5 · COMMENT, then RESOLVED ────────────────────────────────────
  await A.getByRole('button', { name: /Select \/ comment/i }).click();
  await beat(A, 400);
  await A.mouse.click(c.x, c.y - r);           // select the recognised shape
  await beat(A, 700);

  const commentsToggle = A.getByRole('button', { name: /Toggle comments panel/i });
  if (await commentsToggle.count()) {
    await commentsToggle.click();
    await A.waitForSelector('.comments-panel');
    await beat(A, 500);
    await A.locator('.comments-panel textarea').fill('tighten this curve');
    await beat(A, 600);
    await A.locator('.comments-panel .add-button').click();
    await beat(A, 1500);          // the pin scales in and pulses
    const resolve = A.locator('.comments-panel .resolve-button');
    if (await resolve.count()) {
      await resolve.first().click();
      await beat(A, 1800);        // the pin goes static
    }
  }

  // ── Final held frame ───────────────────────────────────────────────────
  await glide(B, at(0.58, 0.66), at(0.44, 0.44), 20, 20);
  await beat(A, 2000);

  await ctxB.close();
  await ctxA.close();              // flushes the video file
  await browser.close();

  const video = fs.readdirSync(OUT).find((f) => f.endsWith('.webm'));
  if (!video) {
    console.error('no video was produced');
    process.exit(1);
  }
  console.log(path.join(OUT, video));
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
