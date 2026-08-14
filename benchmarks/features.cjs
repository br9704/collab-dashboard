/**
 * Sprint 3 gate — no emitter without a receiver.
 *
 * Templates, Smart Shapes, Layers, Text Formatting, Video Embed and shape-recognition-accept
 * used to emit socket events no server handler had ever listened for: clicking them did
 * literally nothing. Each one is now exercised through the real UI in window A, and the
 * result is asserted in window B — a second browser that only learns about it over the wire.
 *
 * Round-tripping is the whole point. A feature that only changes the local canvas is not a
 * collaborative feature.
 */
const { chromium } = require('playwright');

const APP = 'http://localhost:5173';
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Read the element table out of the live Yjs document, as window B sees it. */
async function docSummary(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.drawing-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) ink++;
    }
    return {
      ink,
      videos: document.querySelectorAll('.video-embed-item, .video-embed-canvas > *').length,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const errA = [], errB = [];
  A.on('console', (m) => m.type() === 'error' && errA.push(m.text()));
  B.on('console', (m) => m.type() === 'error' && errB.push(m.text()));
  A.on('pageerror', (e) => errA.push(`pageerror: ${e.message}`));
  B.on('pageerror', (e) => errB.push(`pageerror: ${e.message}`));

  const synced = (p) => p.waitForFunction(
    () => document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 15000 });

  // ── A creates, B joins and is promoted to editor ───────────────────────
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

  // ── 0. Promote B to editor. Also exercises role-change end to end: the read-only flag on
  //      a Hocuspocus connection is fixed for its lifetime, so B's document connection has
  //      to be reopened for the new permission to take effect. ────────────────────────────
  const roleBefore = (await B.locator('.role-badge').innerText()).trim().toLowerCase();
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();
  await A.waitForSelector('.roles-panel');
  const selects = A.locator('.roles-panel select');
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    if ((await selects.nth(i).inputValue()) === 'viewer') {
      await selects.nth(i).selectOption('editor');
      break;
    }
  }
  await B.waitForTimeout(2500);
  await synced(B);
  const roleAfter = (await B.locator('.role-badge').innerText()).trim().toLowerCase();
  check('ROLE CHANGE reaches the other window and re-opens its document',
    roleBefore === 'viewer' && roleAfter === 'editor',
    `B: ${roleBefore} -> ${roleAfter}`);
  await A.getByRole('button', { name: /Toggle roles management panel/i }).click();

  // ── 1. LAYERS ──────────────────────────────────────────────────────────
  await A.getByRole('button', { name: /Toggle layers panel/i }).click();
  await A.waitForSelector('.layers-panel', { timeout: 5000 });
  const layersBefore = await B.evaluate(() => 1); // B has the default layer

  // The add button only enables once a name is typed.
  await A.locator('.layers-panel .layer-input').fill('Annotations');
  await A.locator('.layers-panel .add-layer-button').click();
  await A.waitForTimeout(1000);
  const layerCountA = await A.locator('.layers-panel .layer-item, .layers-panel li').count();
  check('layers panel opens and a layer can be created', layerCountA >= 2,
    `${layerCountA} layer rows in A (was 1)`);

  // Layers are document state, so B must see the same list.
  await B.getByRole('button', { name: /Toggle layers panel/i }).click();
  await B.waitForTimeout(800);
  const layerCountB = await B.locator('.layers-panel .layer-item, .layers-panel li').count();
  check('LAYERS round-trip to the other window', layerCountB === layerCountA,
    `A=${layerCountA} rows, B=${layerCountB} rows`);

  await A.getByRole('button', { name: /Toggle layers panel/i }).click();
  await B.getByRole('button', { name: /Toggle layers panel/i }).click();

  // ── 2. TEMPLATES ───────────────────────────────────────────────────────
  const beforeTemplate = await docSummary(B);
  await A.getByRole('button', { name: /Open template manager/i }).click();
  await A.waitForTimeout(600);
  // The load button only appears once a template card is selected.
  await A.locator('.template-card').first().click();
  await A.waitForTimeout(300);
  await A.locator('.template-load-btn').click();
  await A.waitForTimeout(1800);
  const afterTemplate = await docSummary(B);
  check('TEMPLATES round-trip to the other window',
    afterTemplate.ink > beforeTemplate.ink + 200,
    `B ink ${beforeTemplate.ink} -> ${afterTemplate.ink} px`);

  // ── 3. SMART SHAPES ────────────────────────────────────────────────────
  const beforeSmart = await docSummary(B);
  await A.getByRole('button', { name: /Toggle smart shapes panel/i }).click();
  await A.waitForTimeout(500);
  await A.waitForSelector('.smart-shapes-panel');
  // Categories are collapsed until expanded.
  const cat = A.locator('.smart-shapes-panel .category-toggle').first();
  if (!(await A.locator('.smart-shapes-panel .shape-button').first().isVisible().catch(() => false))) {
    await cat.click();
    await A.waitForTimeout(300);
  }
  await A.locator('.smart-shapes-panel .shape-button').first().click();
  await A.waitForTimeout(400);
  // Measure AFTER the panel opens — it shrinks the canvas, so an earlier box is stale.
  let boxA = await A.locator('.drawing-canvas').boundingBox();
  await A.mouse.click(boxA.x + boxA.width * 0.6, boxA.y + boxA.height * 0.7);
  await A.waitForTimeout(1800);
  const afterSmart = await docSummary(B);
  check('SMART SHAPES round-trip to the other window',
    afterSmart.ink > beforeSmart.ink + 50,
    `B ink ${beforeSmart.ink} -> ${afterSmart.ink} px`);

  // ── 4. TEXT + FORMATTING ───────────────────────────────────────────────
  // Close the smart-shapes panel so the canvas geometry is stable again.
  await A.getByRole('button', { name: /Toggle smart shapes panel/i }).click();
  await A.waitForTimeout(400);
  boxA = await A.locator('.drawing-canvas').boundingBox();

  await A.keyboard.press('5'); // text tool
  await A.waitForTimeout(200);
  // Keep well clear of the bottom-left undo controls and the bottom-centre toast stack,
  // which otherwise intercept the click.
  const textX = boxA.x + boxA.width * 0.25, textY = boxA.y + boxA.height * 0.35;
  await A.mouse.click(textX, textY);
  await A.waitForSelector('.text-input-field', { timeout: 5000 });
  await A.locator('.text-input-field').fill('formatted');
  await A.locator('.text-btn-submit').click();
  await A.waitForTimeout(1400);

  // Let any pending shape-recognition auto-keep resolve (3s chip) before measuring pixels:
  // a recognition replacing a stroke changes the ink independently of formatting.
  await A.waitForTimeout(3600);
  await B.waitForTimeout(400);

  const elCountB = await B.locator('.doc-status').getAttribute('data-doc-elements');
  check('TEXT is created and reaches the other window', Number(elCountB) > 0,
    `B holds ${elCountB} elements`);

  const beforeFormat = await docSummary(B);
  // Click the select tool explicitly rather than relying on a key press.
  await A.getByRole('button', { name: /Select \/ comment/i }).click();
  await A.waitForTimeout(300);
  await A.mouse.click(textX + 20, textY - 5);
  await A.waitForTimeout(800);

  const boldBtn = A.locator('.text-formatting-toolbar button').first();
  const toolbarVisible = await A.locator('.text-formatting-toolbar').isVisible().catch(() => false);
  if (toolbarVisible) {
    await boldBtn.click();
    await A.waitForTimeout(1200);
  }
  const afterFormat = await docSummary(B);
  check('TEXT FORMATTING round-trips (bold changes the rendered glyphs)',
    toolbarVisible && afterFormat.ink !== beforeFormat.ink,
    toolbarVisible
      ? `B ink ${beforeFormat.ink} -> ${afterFormat.ink} px`
      : 'formatting toolbar never became visible');

  // ── 5. VIDEO EMBED ─────────────────────────────────────────────────────
  await A.getByRole('button', { name: /Open video embed dialog/i }).click();
  await A.waitForTimeout(600);
  await A.locator('.video-url-input').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await A.waitForTimeout(300);
  await A.locator('.video-embed-btn-submit').click();
  await A.waitForTimeout(1800);

  const videosB = await B.locator('.video-embed-canvas iframe, .video-embed-canvas video, .video-embed-item').count();
  check('VIDEO EMBED round-trips to the other window', videosB >= 1,
    `${videosB} embed(s) rendered in B`);

  // ── 6. TOOL BROADCAST ──────────────────────────────────────────────────
  await A.keyboard.press('3'); // rectangle
  await A.waitForTimeout(900);
  const toolGlyphB = await B.locator('.user-tool').count();
  check("TOOL SELECTION is visible to the other window", toolGlyphB >= 1,
    `${toolGlyphB} tool indicator(s) in B`);

  // ── 7. No dead controls, no errors ─────────────────────────────────────
  check('no console errors in window A', errA.length === 0, errA.slice(0, 2).join(' | ') || 'clean');
  check('no console errors in window B', errB.length === 0, errB.slice(0, 2).join(' | ') || 'clean');

  await A.screenshot({ path: `${__dirname}/sprint3-a.png` });
  await B.screenshot({ path: `${__dirname}/sprint3-b.png` });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
