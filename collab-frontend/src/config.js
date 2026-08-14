/**
 * CONFIG.JS — where the backend lives.
 *
 * The socket URL used to be the string `'http://localhost:3001'`, hardcoded in two places
 * (`App.jsx` and `useSocket.js`) with no environment variable anywhere in the frontend. A
 * deployed build therefore tried to reach **the visitor's own localhost** — the single reason
 * this application could not run anywhere but the machine that built it.
 *
 * ONE variable to set. `VITE_COLLAB_URL` exists as an escape hatch for a split deployment,
 * but the common case — one backend process serving both socket.io and the Yjs document on
 * one port — needs only `VITE_SOCKET_URL`.
 *
 * Vite inlines `import.meta.env.*` at BUILD time, not at runtime. A container image built
 * with the wrong value cannot be fixed by changing the environment and restarting; it has to
 * be rebuilt. That is a property of the tool, not an oversight, and DEPLOYMENT.md says so.
 */

const DEFAULT_SOCKET_URL = 'http://localhost:3001';

/** The Yjs document server shares the HTTP server, at a fixed path. */
export const COLLAB_PATH = '/collaboration';

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || DEFAULT_SOCKET_URL;

/**
 * Derive the WebSocket URL from the HTTP one, upgrading the scheme.
 * Getting this wrong is a classic deployment failure: an https page cannot open a ws://
 * socket — browsers block it as mixed content — so https must become wss.
 */
function deriveCollabUrl(httpUrl) {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = COLLAB_PATH;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return `ws://localhost:3001${COLLAB_PATH}`;
  }
}

export const COLLAB_URL = import.meta.env.VITE_COLLAB_URL || deriveCollabUrl(SOCKET_URL);

/** Surfaced in the UI so a misconfigured deployment is diagnosable without a rebuild. */
export const ENDPOINTS = { socket: SOCKET_URL, collab: COLLAB_URL };
