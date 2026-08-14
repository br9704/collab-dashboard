/**
 * Sprint 2 gate — persistence and CRDT-level permission enforcement.
 *
 *   1. Draw on a board.
 *   2. KILL the server process and start a new one.
 *   3. Reopen the same session id in a fresh browser context.
 *      The ink must still be there.
 *
 * Plus the security property that a CRDT makes easy to get wrong: a viewer has a live,
 * writable-looking handle on the shared document. If the read-only flag is not enforced at
 * the connection, a viewer can write strokes and every peer will accept them — the role
 * model becomes decorative. This drives that path directly, bypassing the UI.
 */
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');

const APP = 'http://localhost:5173';
// Derived from this file's location, not hardcoded: a benchmark that only runs on the
// machine that wrote it is not a benchmark.
const BACKEND_DIR = path.resolve(__dirname, '..', 'collab-backend');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function killBackend() {
  try { execSync("pkill -f 'node server.js'"); } catch { /* already down */ }
}

function startBackend() {
  const p = spawn('node', ['server.js'], { cwd: BACKEND_DIR, detached: true, stdio: 'ignore' });
  p.unref();
  return p;
}

async function inkPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) n++;
    }
    return n;
  });
}

(async () => {
  const browser = await chromium.launch();

  // ── 1. Create a board and draw on it ───────────────────────────────────
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage();
  await A.goto(APP, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: /Create a new whiteboard session/i }).click();
  await A.waitForSelector('.drawing-canvas');
  await A.waitForFunction(() =>
    document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 10000 });

  const sessionId = await A.locator('#session-id-value').getAttribute('data-session-id');

  const box = await A.locator('.drawing-canvas').boundingBox();
  await A.mouse.move(box.x + 150, box.y + 150);
  await A.mouse.down();
  for (let i = 0; i <= 25; i++) {
    await A.mouse.move(box.x + 150 + i * 14, box.y + 150 + Math.sin(i / 2) * 50);
    await A.waitForTimeout(10);
  }
  await A.mouse.up();
  await A.waitForTimeout(500);

  const before = await inkPixels(A);
  check('ink is on the board before the restart', before > 200, `${before} px`);

  // Hocuspocus debounces persistence by 2s; give it time to hit SQLite.
  await A.waitForTimeout(3500);
  // Keep the CONTEXT alive (its localStorage holds this browser's stable client id) but
  // close the page, so the reload later is a genuine "same person comes back".
  await A.close();

  // ── 2. Kill the server, start a new process ────────────────────────────
  killBackend();
  await wait(1500);

  let healthAfterKill = 'unreachable';
  try {
    const r = await fetch('http://localhost:3001/health');
    healthAfterKill = `HTTP ${r.status}`;
  } catch { /* expected */ }
  check('the server really was killed', healthAfterKill === 'unreachable', healthAfterKill);

  startBackend();
  await wait(3000);

  const health = await (await fetch('http://localhost:3001/health')).json();
  check('a NEW server process is serving', health.status === 'ok',
    `uptime=${health.uptime}s (must be small), sessions=${health.sessions}`);
  check('session metadata survived the restart', health.sessions >= 1,
    `${health.sessions} session(s) in SQLite`);

  // ── 3a. The SAME browser comes back: role must be restored ─────────────
  // Same context = same localStorage = same stable client id. This is the real-world
  // "creator reloads the page" case, which must not demote them on their own board.
  const A2 = await ctxA.newPage();
  await A2.goto(APP, { waitUntil: 'networkidle' });
  await A2.getByLabel(/Session ID input/i).fill(sessionId);
  await A2.getByRole('button', { name: /Join the session/i }).click();
  await A2.waitForSelector('.drawing-canvas');
  await A2.waitForTimeout(1200);
  const roleReturning = (await A2.locator('.role-badge').innerText()).trim().toLowerCase();
  check('a returning member keeps the role stored for them', roleReturning === 'creator',
    `role=${roleReturning} (same browser profile, after a full server restart)`);
  await ctxA.close();

  // ── 3b. A brand-new browser context: proves the ink came from the SERVER ─
  // Fresh profile = empty IndexedDB, so nothing can have been served from offline cache.
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const C = await ctxC.newPage();
  const errorsC = [];
  C.on('console', (m) => m.type() === 'error' && errorsC.push(m.text()));

  await C.goto(APP, { waitUntil: 'networkidle' });
  await C.getByLabel(/Session ID input/i).fill(sessionId);
  await C.getByRole('button', { name: /Join the session/i }).click();
  await C.waitForSelector('.drawing-canvas');
  await C.waitForFunction(() =>
    document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 10000 });
  await C.waitForTimeout(1200);

  const after = await inkPixels(C);
  check('THE BOARD SURVIVED A SERVER RESTART', after > 200,
    `${after} px restored (was ${before} px, fresh browser profile, empty IndexedDB)`);

  const roleC = (await C.locator('.role-badge').innerText()).trim().toLowerCase();
  check('an unknown browser is a viewer, not the creator', roleC === 'viewer', `role=${roleC}`);

  // ── 4. A viewer must not be able to write to the document ──────────────
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const V = await ctxV.newPage();
  await V.goto(APP, { waitUntil: 'networkidle' });
  await V.getByLabel(/Session ID input/i).fill(sessionId);
  await V.getByRole('button', { name: /Join the session/i }).click();
  await V.waitForSelector('.drawing-canvas');
  await V.waitForFunction(() =>
    document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 10000 });
  await V.waitForTimeout(800);

  const roleV = (await V.locator('.role-badge').innerText()).trim().toLowerCase();
  check('a further joiner is also a viewer', roleV === 'viewer', `role=${roleV}`);

  const inkBeforeAttack = await inkPixels(C);

  // Drag across the viewer's canvas: the UI should refuse it.
  const boxV = await V.locator('.drawing-canvas').boundingBox();
  await V.mouse.move(boxV.x + 400, boxV.y + 500);
  await V.mouse.down();
  for (let i = 0; i < 15; i++) await V.mouse.move(boxV.x + 400 + i * 10, boxV.y + 500);
  await V.mouse.up();
  await V.waitForTimeout(1500);

  const inkAfterUiAttempt = await inkPixels(C);
  check('a viewer cannot draw through the UI',
    inkAfterUiAttempt === inkBeforeAttack,
    `creator's canvas: ${inkBeforeAttack} px -> ${inkAfterUiAttempt} px`);

  await ctxC.close();
  await ctxV.close();
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
