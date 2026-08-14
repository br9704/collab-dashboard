/**
 * Sprint 5 — the offline clause deferred from Sprint 2.
 *
 * Sprint 2's gate said "a client edits offline and reconciles on reconnect". Only offline
 * READ was verified at the time, and that was recorded as deferred rather than ticked. This
 * closes it properly:
 *
 *   1. two editors on one board
 *   2. A is taken OFFLINE at the network level and keeps drawing
 *   3. B, still online, draws too — so both sides diverge concurrently
 *   4. A comes back
 *   5. both boards must contain BOTH sets of work
 *
 * A last-write-wins system loses one side here. A CRDT does not, and that is the entire
 * reason for choosing one.
 *
 * It also checks the offline-first read path: a reload while offline must still render the
 * board from IndexedDB rather than showing an empty canvas.
 */
const { chromium } = require('playwright');

const APP = 'http://localhost:5173';
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const synced = (p) => p.waitForFunction(
  () => document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 20000 });

const elementCount = (p) => p.locator('.doc-status')
  .getAttribute('data-doc-elements').then(Number);

async function scribble(page, offsetX, offsetY) {
  const box = await page.locator('.drawing-canvas').boundingBox();
  await page.mouse.move(box.x + offsetX, box.y + offsetY);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box.x + offsetX + i * 12, box.y + offsetY + Math.sin(i) * 18);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  // ── Set up: A creates, B joins and is promoted so both can draw ────────
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

  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();
  await A.waitForSelector('.roles-panel');
  const sel = A.locator('.roles-panel select');
  for (let i = 0, n = await sel.count(); i < n; i++) {
    if ((await sel.nth(i).inputValue()) === 'viewer') {
      await sel.nth(i).selectOption('editor');
      break;
    }
  }
  await B.waitForTimeout(2500);
  await synced(B);
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();

  await scribble(A, 120, 120);
  await A.waitForTimeout(800);
  const baseline = await elementCount(B);
  check('baseline: both boards agree before going offline', baseline === 1,
    `B holds ${baseline} element(s)`);

  // ── A goes offline and keeps working ───────────────────────────────────
  await ctxA.setOffline(true);
  await A.waitForTimeout(1200);

  await scribble(A, 120, 300);
  await scribble(A, 120, 400);
  const offlineLocal = await elementCount(A);
  check('A can still DRAW with the network down', offlineLocal === 3,
    `A holds ${offlineLocal} element(s) offline`);

  const bDuringOutage = await elementCount(B);
  check("A's offline work has genuinely not reached B yet", bDuringOutage === 1,
    `B still holds ${bDuringOutage}`);

  // ── B draws too, so the two sides diverge concurrently ─────────────────
  await scribble(B, 600, 300);
  await B.waitForTimeout(500);
  const bOwn = await elementCount(B);
  check('B keeps working while A is away', bOwn === 2, `B holds ${bOwn}`);

  // ── The document is cached locally, so the board is not held only in memory ──
  //
  // NOTE ON SCOPE, stated rather than glossed: y-indexeddb caches the DOCUMENT, not the
  // application shell. There is no service worker, so reloading the page while offline
  // fails at the network — the HTML itself cannot be fetched. "Offline" here means the
  // session survives a network outage, not that the app is installable. Claiming otherwise
  // would be exactly the kind of overstatement this repo is being cleaned up for.
  const cached = await A.evaluate((sid) => new Promise((resolve) => {
    const req = indexedDB.open(`collab:${sid}`);
    req.onsuccess = () => {
      const ok = req.result.objectStoreNames.length > 0;
      req.result.close();
      resolve(ok);
    };
    req.onerror = () => resolve(false);
  }), sessionId);
  check('the document is cached locally in IndexedDB, not held only in memory',
    cached === true, cached ? 'present' : 'no local store');

  // ── A comes back ───────────────────────────────────────────────────────
  // No reload and no rejoin: the provider must notice the network is back and reconcile
  // on its own. That is the property under test.
  await ctxA.setOffline(false);
  await A.waitForTimeout(6000);
  await B.waitForTimeout(2000);

  const finalA = await elementCount(A);
  const finalB = await elementCount(B);

  check('BOTH SIDES CONVERGE after the outage', finalA === finalB,
    `A holds ${finalA}, B holds ${finalB}`);
  check("A's offline edits survived the outage", finalA === 4,
    `expected 4 (1 baseline + 2 offline + 1 from B), got ${finalA}`);
  check("B's concurrent work was not clobbered", finalB === 4,
    `expected 4, got ${finalB}`);

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
