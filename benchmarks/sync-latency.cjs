/**
 * MEASURING THE CLAIM.
 *
 * The portfolio says "50–80ms sync". Nothing in this repo ever backed that, and a
 * `latency-ping` round trip does not back it either — a ping measures the transport, not the
 * product. What a user experiences is **the time between one person finishing a stroke and it
 * appearing on someone else's screen**, which includes the CRDT update, the server relay, the
 * remote apply and the React render.
 *
 * So that is what this measures, with both clocks in the same process:
 *
 *   t0  A commits the stroke to its Y.Doc          (measured in A's page)
 *   t1  the element is present in B's document     (measured in B's page)
 *
 * Both timestamps come from `Date.now()` in two contexts of the SAME browser on the SAME
 * machine, so there is no clock skew to correct for.
 *
 * It also reports the socket round trip separately, because the two numbers answer different
 * questions and conflating them is how "50–80ms" got written down in the first place.
 */
const { chromium } = require('playwright');

const APP = process.env.APP_URL || 'http://localhost:5173';
const SAMPLES = Number(process.env.SAMPLES || 30);
const LABEL = process.env.LABEL || 'loopback (same machine)';

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const synced = (p) => p.waitForFunction(
    () => document.querySelector('.doc-status')?.dataset.docSynced === 'yes', { timeout: 20000 });

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
  await B.waitForTimeout(800);

  const box = await A.locator('.drawing-canvas').boundingBox();
  const endToEnd = [];

  for (let i = 0; i < SAMPLES; i++) {
    // Watch B for the NEXT element to arrive, and stamp the moment it does.
    const arrival = B.evaluate((expected) => new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const n = Number(document.querySelector('.doc-status')?.dataset.docElements || 0);
        if (n >= expected) return resolve(Date.now());
        if (Date.now() - started > 5000) return resolve(null);
        requestAnimationFrame(tick);
      };
      tick();
    }), i + 1);

    // Draw a short stroke. The document write happens on pointer-up.
    const y = box.y + 80 + (i % 12) * 40;
    await A.mouse.move(box.x + 100, y);
    await A.mouse.down();
    await A.mouse.move(box.x + 160, y + 12);
    await A.mouse.move(box.x + 220, y - 8);
    const t0 = await A.evaluate(() => Date.now());
    await A.mouse.up();

    const t1 = await arrival;
    if (t1 !== null) endToEnd.push(t1 - t0);
    await A.waitForTimeout(120);
  }

  // The socket round trip, for comparison — a different question entirely.
  const rtt = await A.evaluate((n) => new Promise((resolve) => {
    const samples = [];
    const io = window.__socketForTest;
    if (!io) return resolve(null);
    let i = 0;
    const ping = () => {
      const t = Date.now();
      io.emit('latency-ping', { clientTime: t });
      io.once('latency-pong', () => {
        samples.push(Date.now() - t);
        if (++i < n) setTimeout(ping, 20); else resolve(samples);
      });
    };
    ping();
  }), 40).catch(() => null);

  await browser.close();

  endToEnd.sort((a, b) => a - b);
  const report = {
    label: LABEL,
    metric: 'stroke committed by A → element present in B',
    samples: endToEnd.length,
    p50: pct(endToEnd, 0.5),
    p95: pct(endToEnd, 0.95),
    p99: pct(endToEnd, 0.99),
    min: endToEnd[0],
    max: endToEnd[endToEnd.length - 1],
  };

  console.log(JSON.stringify(report, null, 2));
  if (rtt) {
    rtt.sort((a, b) => a - b);
    console.log(`socket RTT (transport only): p50 ${pct(rtt, 0.5)}ms  p95 ${pct(rtt, 0.95)}ms`);
  }
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
});
