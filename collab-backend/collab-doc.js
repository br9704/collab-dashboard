/**
 * COLLAB-DOC.JS — the Yjs document server.
 *
 * Mounts Hocuspocus on the SAME HTTP server as socket.io, at the `/collaboration` path, so
 * the whole backend is one process on one port. That matters: a WebSocket backend needs a
 * long-lived process, and free-tier hosting gives you exactly one.
 *
 * Division of responsibility:
 *
 *   Y.Doc (here, persisted to SQLite)   strokes, shapes, text, comments — the board
 *   Awareness (here, ephemeral)          cursors, camera, who is drawing — never persisted
 *   store.js (SQLite)                    session metadata + roles — server-authoritative
 *   socket.io (server.js)                session lifecycle, role changes, activity log
 *
 * PERMISSIONS ARE ENFORCED AT THE CONNECTION, NOT IN THE UI. A CRDT gives every connected
 * client write access to the shared type by default, so a viewer could simply write strokes
 * into the document and every peer would accept them. `onAuthenticate` therefore looks the
 * member's role up in SQLite and marks viewer connections read-only, which makes Hocuspocus
 * reject their document updates server-side.
 */

const { Hocuspocus } = require('@hocuspocus/server');
const { SQLite } = require('@hocuspocus/extension-sqlite');
const { WebSocketServer } = require('ws');
const store = require('./store');
const { ROLES } = require('./roles');

const COLLAB_PATH = '/collaboration';

/**
 * The client sends `${sessionId}:${userId}` as its token. Both halves are verified against
 * SQLite; a token for a session the user is not a member of is rejected outright.
 */
function parseToken(token) {
  if (typeof token !== 'string') return null;
  const idx = token.lastIndexOf(':');
  if (idx <= 0) return null;
  return { sessionId: token.slice(0, idx), userId: token.slice(idx + 1) };
}

function createDocServer({ onLog = () => {} } = {}) {
  const hocuspocus = new Hocuspocus();

  hocuspocus.configure({
    name: 'collab-dashboard',

    extensions: [
      new SQLite({
        // Same file as store.js, so one volume holds the whole application state.
        database: store.DB_PATH,
      }),
    ],

    // Persist ~2s after the last change, and at least every 10s during sustained drawing.
    debounce: 2000,
    maxDebounce: 10000,

    async onAuthenticate(data) {
      const parsed = parseToken(data.token);
      if (!parsed) {
        throw new Error('Malformed collaboration token');
      }

      const { sessionId, userId } = parsed;

      // The document name IS the session id. Refuse tokens minted for a different board —
      // otherwise a valid member of board A could open board B read-write.
      if (data.documentName !== sessionId) {
        throw new Error('Token does not match the requested document');
      }

      if (!store.sessionExists(sessionId)) {
        throw new Error('Unknown session');
      }

      const role = store.getMemberRole(sessionId, userId);
      if (!role) {
        throw new Error('Not a member of this session');
      }

      // THE permission boundary. Everything upstream of this is advisory UI.
      if (role === ROLES.VIEWER) {
        data.connectionConfig.readOnly = true;
      }

      onLog(`[DOC] ${userId} opened ${sessionId} as ${role}${role === ROLES.VIEWER ? ' (read-only)' : ''}`);

      return { sessionId, userId, role };
    },

    async onStoreDocument(data) {
      onLog(`[DOC] persisted ${data.documentName}`);
    },
  });

  /**
   * Attach to an existing http.Server without taking over its upgrade handling.
   *
   * socket.io registers its own `upgrade` listener on the same server. Both listeners run for
   * every upgrade, so this one must return silently for paths it does not own — destroying
   * the socket here would kill every socket.io connection.
   *
   * Hocuspocus 4 runs on `crossws`, and `handleConnection` does NOT subscribe to the socket
   * itself: its own server pumps frames in via `peer._hocuspocus.handleMessage(...)`. Hosting
   * it on a plain `ws` server therefore means forwarding `message` and `close` by hand.
   * Without that the WebSocket opens, the client reports "connected", and nothing ever syncs
   * — no error, just silence.
   *
   * It also expects a Fetch-style request: `headers` must be a `Headers` instance, not Node's
   * plain header object.
   */
  function attach(httpServer) {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws, request) => {
      const fetchLikeRequest = {
        url: request.url,
        headers: new Headers(
          Object.entries(request.headers)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v])
        ),
      };

      const clientConnection = hocuspocus.handleConnection(ws, fetchLikeRequest);

      ws.on('message', (data) => {
        // `ws` hands us a Buffer (or an array of them for fragmented frames); Hocuspocus
        // wants a Uint8Array view.
        const buf = Array.isArray(data) ? Buffer.concat(data) : data;
        clientConnection.handleMessage(new Uint8Array(buf));
      });

      ws.on('close', (code, reason) => {
        clientConnection.handleClose({ code, reason: reason?.toString() || '' });
      });

      ws.on('error', (err) => {
        onLog(`[DOC] socket error: ${err.message}`);
      });
    });

    httpServer.on('upgrade', (request, socket, head) => {
      let pathname;
      try {
        pathname = new URL(request.url, 'http://localhost').pathname;
      } catch {
        return;
      }

      // Not ours — leave it for socket.io's listener. Do NOT destroy the socket.
      if (pathname !== COLLAB_PATH) return;

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    return wss;
  }

  return { hocuspocus, attach, COLLAB_PATH };
}

module.exports = { createDocServer, COLLAB_PATH };
