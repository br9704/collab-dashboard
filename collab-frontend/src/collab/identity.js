/**
 * IDENTITY.JS — a stable identity for this browser.
 *
 * Membership and roles are persisted, which is only meaningful if a returning person can be
 * recognised. Socket ids cannot do that: socket.io mints a new one on every connection, so
 * keying membership by socket id means a reload makes you a stranger — and the creator of a
 * board would come back to their own board as a viewer, with no way to regain control.
 *
 * This id is deliberately NOT a security credential. It identifies a browser, not a person,
 * and the server treats it as a claim about which membership row to use. Real authentication
 * is out of scope for this project; what matters here is that the persistence layer has a key
 * that outlives a connection.
 */

const STORAGE_KEY = 'collab:clientId';

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

let cached = null;

export function getClientId() {
  if (cached) return cached;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return cached;
    }
    const fresh = randomId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return cached;
  } catch {
    // Private browsing or storage disabled: fall back to a per-tab identity. Membership
    // then behaves as it did before — a reload is a new user — but nothing breaks.
    cached = randomId();
    return cached;
  }
}
