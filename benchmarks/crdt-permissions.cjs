/**
 * Sprint 2 — the security property a CRDT makes easy to get wrong.
 *
 * In a naive Yjs deployment every connected client holds a fully writable handle on the
 * shared document. Hiding the toolbar from viewers is decoration: a viewer can write straight
 * into the Y.Doc and all peers will merrily merge it. The role model has to be enforced at
 * the connection, or it is not enforced at all.
 *
 * This bypasses the UI completely and speaks the wire protocol directly:
 *
 *   1. creator opens the document and writes a stroke
 *   2. VIEWER opens the same document with a VALID viewer token and writes a stroke
 *   3. an independent observer re-reads the document from the server
 *
 * The creator's stroke must survive. The viewer's must not.
 *
 * It also checks two forgeries the token scheme must refuse: membership of a session you
 * never joined, and a token whose session half does not match the requested document.
 */
const io = require('socket.io-client');
const Y = require('yjs');
const { HocuspocusProvider } = require('@hocuspocus/provider');
const WebSocket = require('ws');

const SOCKET_URL = 'http://localhost:3001';
const COLLAB_URL = 'ws://localhost:3001/collaboration';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function control(clientId) {
  return new Promise((resolve) => {
    const s = io(SOCKET_URL, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
  });
}

/** Open a document connection and wait for the initial sync (or an auth failure). */
function openDoc({ sessionId, token, timeoutMs = 6000 }) {
  return new Promise((resolve) => {
    const ydoc = new Y.Doc();
    let settled = false;

    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: sessionId,
      document: ydoc,
      token,
      WebSocketPolyfill: WebSocket,
      onAuthenticationFailed: ({ reason }) => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: reason || 'auth failed', ydoc, provider });
      },
      onSynced: () => {
        if (settled) return;
        settled = true;
        resolve({ ok: true, ydoc, provider });
      },
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: 'timeout (never synced)', ydoc, provider });
    }, timeoutMs);
  });
}

const strokeIds = (ydoc) => Array.from(ydoc.getMap('elements').keys());

(async () => {
  // ── Set up a board with a creator and a viewer ──────────────────────────
  const creatorCtl = await control();
  const ackA = await new Promise((res) =>
    creatorCtl.emit('session-create', { clientId: 'attack-creator' }, res));
  const sessionId = ackA.sessionId;

  const viewerCtl = await control();
  const ackV = await new Promise((res) =>
    viewerCtl.emit('session-join', { sessionId, clientId: 'attack-viewer' }, res));

  check('setup: creator is creator', ackA.role === 'creator', `role=${ackA.role}`);
  check('setup: viewer is viewer', ackV.role === 'viewer', `role=${ackV.role}`);

  // ── 1. The creator writes ───────────────────────────────────────────────
  const creator = await openDoc({ sessionId, token: ackA.collabToken });
  check('creator can open the document', creator.ok, creator.reason || 'synced');

  creator.ydoc.getMap('elements').set('legit-stroke', {
    kind: 'stroke', userId: 'attack-creator',
    points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#000', width: 2, seq: 1,
  });
  await wait(1500);

  // ── 2. The viewer writes, straight into the CRDT ───────────────────────
  const viewer = await openDoc({ sessionId, token: ackV.collabToken });
  check('viewer CAN open the document (read access is legitimate)', viewer.ok,
    viewer.reason || 'synced');

  const viewerSawCreatorStroke = strokeIds(viewer.ydoc).includes('legit-stroke');
  check('viewer receives the board (read works)', viewerSawCreatorStroke,
    `elements=${JSON.stringify(strokeIds(viewer.ydoc))}`);

  // No UI involved. This is the attack.
  viewer.ydoc.getMap('elements').set('viewer-injected-stroke', {
    kind: 'stroke', userId: 'attack-viewer',
    points: [{ x: 9, y: 9 }, { x: 10, y: 10 }], color: '#f00', width: 9, seq: 2,
  });
  await wait(2000);

  // ── 3. An independent observer re-reads from the server ────────────────
  const observerCtl = await control();
  const ackO = await new Promise((res) =>
    observerCtl.emit('session-join', { sessionId, clientId: 'attack-observer' }, res));
  const observer = await openDoc({ sessionId, token: ackO.collabToken });

  const seen = strokeIds(observer.ydoc);
  check("the creator's stroke is on the server", seen.includes('legit-stroke'),
    `elements=${JSON.stringify(seen)}`);
  check("THE VIEWER'S WRITE WAS REJECTED SERVER-SIDE",
    !seen.includes('viewer-injected-stroke'),
    `elements=${JSON.stringify(seen)}`);

  // ── 4. Token forgeries ──────────────────────────────────────────────────
  const strangerToken = `${sessionId}:not-a-member-at-all`;
  const stranger = await openDoc({ sessionId, token: strangerToken, timeoutMs: 4000 });
  check('a token for a non-member is refused', !stranger.ok, stranger.reason || 'CONNECTED');

  const otherAck = await new Promise((res) =>
    creatorCtl.emit('session-create', { clientId: 'attack-creator' }, res));
  // A real, valid token — but minted for a different board.
  const wrongDocToken = `${otherAck.sessionId}:attack-creator`;
  const wrongDoc = await openDoc({ sessionId, token: wrongDocToken, timeoutMs: 4000 });
  check('a valid token for a DIFFERENT board is refused', !wrongDoc.ok,
    wrongDoc.reason || 'CONNECTED');

  [creator, viewer, observer, stranger, wrongDoc].forEach((c) => {
    try { c.provider.destroy(); } catch { /* ignore */ }
  });
  creatorCtl.disconnect();
  viewerCtl.disconnect();
  observerCtl.disconnect();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(2);
});
