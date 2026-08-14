/**
 * SERVER.JS — Collab Dashboard backend.
 *
 * ARCHITECTURE (Sprint 2 — see masterplan.md)
 *
 * The board itself is a Yjs document served by Hocuspocus and persisted to SQLite. This file
 * no longer holds strokes, shapes, text or comments in memory: it holds the things a CRDT
 * cannot own safely.
 *
 *   Y.Doc      (collab-doc.js)  strokes · shapes · text · comments      persisted
 *   Awareness  (collab-doc.js)  cursors · camera · who is drawing       ephemeral by design
 *   SQLite     (store.js)       sessions · membership · roles           persisted
 *   socket.io  (this file)      session lifecycle · roles · activity    control plane
 *
 * Why roles are not in the CRDT: every client with document write access could then edit its
 * own role. They live in SQLite, the server is their only writer, and viewers are marked
 * read-only at connection time in `onAuthenticate`.
 *
 * Both transports share one HTTP server and one port, because a WebSocket backend needs a
 * long-lived process and free-tier hosting gives you exactly one.
 */

const express = require('express');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const { ROLES, canPerformAction, getDefaultRole, getCreatorRole } = require('./roles');
const store = require('./store');
const { createDocServer, COLLAB_PATH } = require('./collab-doc');
require('dotenv').config();

/**
 * Allowed origins.
 *
 * This used to be the literal array ['http://localhost:5173', 'http://localhost:3000'],
 * which blocked every deployed frontend outright. Comma-separated, and `*` is accepted for
 * a genuinely public deployment.
 *
 * Defaulting to the local dev origins keeps `npm run dev` working with no .env at all —
 * a config change should not be the price of running the thing locally.
 */
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

const allowAnyOrigin = CORS_ORIGIN.includes('*');

const app = express();
app.use(cors({ origin: allowAnyOrigin ? true : CORS_ORIGIN }));

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: allowAnyOrigin ? true : CORS_ORIGIN,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// ==========================================
// Yjs document server
// ==========================================

const { hocuspocus, attach } = createDocServer({ onLog: (m) => console.log(m) });
attach(server);

// ==========================================
// Ephemeral per-session control state
// ==========================================

/**
 * Live socket presence and the activity feed. Deliberately NOT persisted:
 *
 *   - presence is by definition about who is connected right now
 *   - the activity feed is a session-scoped console, not a durable audit log
 *
 * Everything that must survive a restart is in SQLite or in the Y.Doc. Nothing here is
 * claimed as persistent anywhere in the docs.
 */
const live = new Map(); // sessionId -> { sockets: Set<userId>, activity: [] }

function liveFor(sessionId) {
  if (!live.has(sessionId)) live.set(sessionId, { sockets: new Set(), activity: [] });
  return live.get(sessionId);
}

function logActivity(sessionId, action, userId, details = {}) {
  const l = liveFor(sessionId);
  const entry = { action, userId, timestamp: Date.now(), details };
  l.activity.push(entry);
  if (l.activity.length > 500) l.activity.shift();
  io.to(sessionId).emit('activity', entry);
  return entry;
}

/** The control-plane view of a session: who is here, what everyone's role is. */
function sessionView(sessionId) {
  const row = store.getSession(sessionId);
  if (!row) return null;
  const l = liveFor(sessionId);
  return {
    id: row.id,
    name: row.name,
    creator: row.creator,
    createdAt: row.created_at,
    users: Array.from(l.sockets),
    sessionMembers: store.listMembers(sessionId),
    permissionOverrides: l.overrides || {},
    activityLog: l.activity.slice(-50),
  };
}

function newSessionId() {
  return `sess_${Math.random().toString(36).slice(2, 10)}`;
}

// ==========================================
// HTTP routes
// ==========================================

/**
 * Health check. Every host (Fly, Railway, Render) requires one, and this server previously
 * had zero HTTP routes at all — `curl /` returned Express's default 404.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    sessions: store.sessionCount(),
    documents: hocuspocus.getDocumentsCount(),
    connections: hocuspocus.getConnectionsCount(),
    persistence: 'sqlite',
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'collab-dashboard backend',
    collaboration: COLLAB_PATH,
    health: '/health',
  });
});

// ==========================================
// Socket.io — control plane
// ==========================================

io.on('connection', (socket) => {
  console.log(`[CONNECT] socket ${socket.id}`);
  let currentSessionId = null;
  /**
   * The member identity, supplied by the client and stable across reconnects.
   *
   * NOT socket.id. Membership and roles are persisted, and a socket id is minted fresh on
   * every connection — keying membership by it would mean a reload makes you a stranger, and
   * the creator of a board would return to their own board as a viewer with no way back in.
   * Falls back to socket.id for clients that send nothing, which preserves old behaviour
   * rather than crashing.
   */
  let userId = socket.id;
  let userRole = getDefaultRole();

  /** Everyone in the room re-reads membership and presence from the authoritative source. */
  function broadcastSession(sessionId) {
    const view = sessionView(sessionId);
    if (view) io.to(sessionId).emit('session-updated', view);
  }

  /**
   * SESSION-CREATE
   *
   * The ack carries the full control-plane view. That is not a convenience: the client MUST
   * seed from it, because this broadcast reaches the room before the ack returns and a
   * client cannot have subscribed yet. Getting that backwards is what made the creator a
   * viewer with ONLINE (0) — see masterplan.md.
   */
  socket.on('session-create', (data, callback) => {
    // Older clients passed only a callback; keep that working.
    if (typeof data === 'function') { callback = data; data = {}; }
    if (data?.clientId) userId = String(data.clientId);

    const sessionId = newSessionId();
    store.createSession(sessionId, userId);

    const creatorRole = getCreatorRole();
    store.setMemberRole(sessionId, userId, creatorRole);

    userRole = creatorRole;
    currentSessionId = sessionId;
    socket.join(sessionId);
    liveFor(sessionId).sockets.add(userId);

    console.log(`[SESSION-CREATE] ${userId} created ${sessionId} as ${creatorRole}`);
    logActivity(sessionId, 'user-joined', userId, { role: creatorRole });

    const view = sessionView(sessionId);
    io.to(sessionId).emit('session-updated', view);

    callback && callback({
      sessionId,
      role: creatorRole,
      session: view,
      // The client needs this to open the Y.Doc. Verified server-side on every connection.
      collabToken: `${sessionId}:${userId}`,
    });
  });

  /**
   * SESSION-JOIN
   *
   * A returning member keeps the role they already had — that is the point of persisting
   * membership. Genuinely new joiners get VIEWER and can be promoted by the creator.
   */
  socket.on('session-join', (data, callback) => {
    // Older clients passed the session id as a bare string.
    const sessionId = typeof data === 'string' ? data : data?.sessionId;
    if (typeof data === 'object' && data?.clientId) userId = String(data.clientId);

    if (!sessionId || !store.sessionExists(sessionId)) {
      return callback && callback({ error: 'Session not found' });
    }

    const existingRole = store.getMemberRole(sessionId, userId);
    const role = existingRole || getDefaultRole();
    store.setMemberRole(sessionId, userId, role);

    userRole = role;
    currentSessionId = sessionId;
    socket.join(sessionId);
    liveFor(sessionId).sockets.add(userId);

    console.log(`[SESSION-JOIN] ${userId} joined ${sessionId} as ${role}`);
    logActivity(sessionId, 'user-joined', userId, { role });

    const view = sessionView(sessionId);
    io.to(sessionId).emit('session-updated', view);

    callback && callback({
      sessionId,
      role,
      session: view,
      collabToken: `${sessionId}:${userId}`,
    });
  });

  /**
   * ROLE-CHANGE — creator only.
   *
   * A role change alters the read-only flag on the target's *document* connection, and that
   * flag is fixed for the life of a Hocuspocus connection. The target is therefore told to
   * reopen its document connection so the new permission takes effect immediately rather
   * than at the next reload.
   */
  socket.on('role-change', (data) => {
    if (!currentSessionId) return;

    if (userRole !== ROLES.CREATOR) {
      console.warn(`[PERMISSION DENIED] ${userId} (${userRole}) tried to change a role`);
      return;
    }

    const { userId: targetId, newRole } = data || {};
    if (!targetId || !Object.values(ROLES).includes(newRole)) return;

    const oldRole = store.getMemberRole(currentSessionId, targetId);
    if (!oldRole) return;

    store.setMemberRole(currentSessionId, targetId, newRole);
    console.log(`[ROLE-CHANGE] ${targetId}: ${oldRole} -> ${newRole}`);
    logActivity(currentSessionId, 'role-changed', userId, { targetId, oldRole, newRole });

    io.to(currentSessionId).emit('role-updated', {
      userId: targetId,
      oldRole,
      newRole,
      changedBy: userId,
      // The target must reconnect its Y.Doc for the read-only flag to be re-evaluated.
      requiresDocReconnect: true,
    });

    broadcastSession(currentSessionId);
  });

  /**
   * Permission probe. The UI hides controls a role cannot use; this lets the client ask the
   * authoritative source rather than reimplementing the matrix.
   */
  socket.on('can-i', (action, callback) => {
    callback && callback({ allowed: canPerformAction(userRole, action), role: userRole });
  });

  /**
   * TOOL-CHANGE — ephemeral, stays on sockets.
   *
   * Which tool someone has selected is presence-shaped: it is about right now, and writing
   * it into the persisted document would be wrong. The client emitted this from day one;
   * there was simply never a handler, so nobody ever saw anyone else's tool.
   */
  socket.on('tool-change', (data) => {
    if (!currentSessionId || !data?.mode) return;
    if (!canPerformAction(userRole, 'draw-stroke')) return;
    socket.to(currentSessionId).emit('tool-changed', { userId, mode: data.mode });
  });

  /**
   * PERMISSION-CHANGE — granular per-user permission overrides, creator only.
   *
   * These sit on top of the role matrix rather than replacing it: a role is the baseline and
   * an override adjusts one capability. Overrides are control-plane state and are broadcast
   * so every client's UI agrees, but the hard boundary remains the read-only flag applied to
   * the document connection by role.
   */
  socket.on('permission-change', (change) => {
    if (!currentSessionId) return;

    if (userRole !== ROLES.CREATOR) {
      console.warn(`[PERMISSION DENIED] ${userId} (${userRole}) tried to change permissions`);
      return;
    }
    if (!change?.userId || !change?.permission) return;

    const l = liveFor(currentSessionId);
    if (!l.overrides) l.overrides = {};
    if (!l.overrides[change.userId]) l.overrides[change.userId] = {};
    l.overrides[change.userId][change.permission] = !!change.granted;

    logActivity(currentSessionId, 'permission-changed', userId, {
      targetId: change.userId,
      permission: change.permission,
      granted: !!change.granted,
    });

    io.to(currentSessionId).emit('permissions-snapshot', {
      overrides: l.overrides,
      changedBy: userId,
    });
  });

  socket.on('latency-ping', (data) => {
    socket.emit('latency-pong', {
      clientTime: data?.clientTime,
      serverTime: Date.now(),
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${userId} (${reason})`);
    if (!currentSessionId) return;

    const l = liveFor(currentSessionId);
    l.sockets.delete(userId);
    logActivity(currentSessionId, 'user-left', userId, {});

    /**
     * The session is NOT deleted when it empties.
     *
     * The old code called deleteSession() as soon as the last user left, which meant a board
     * could not outlive its participants even in principle. Persistence was not merely
     * missing; it was structurally impossible. Membership stays in SQLite and the document
     * stays in the `documents` table, so reopening the id restores the board.
     */
    if (l.sockets.size === 0) {
      live.delete(currentSessionId);
      console.log(`[IDLE] ${currentSessionId} has no live users; document retained`);
    } else {
      broadcastSession(currentSessionId);
    }
  });
});

/**
 * Bind to 0.0.0.0 by default, not localhost.
 *
 * Every container platform routes traffic to the container's external interface; a process
 * listening only on the loopback address is unreachable from outside it and the health check
 * fails with no useful error. Overridable via HOST for the rare case that matters.
 */
server.listen(PORT, HOST, () => {
  console.log(`[SERVER]  Listening on ${HOST}:${PORT}`);
  console.log(`[DOC]     Yjs/Hocuspocus at ${COLLAB_PATH}`);
  console.log(`[STORE]   SQLite at ${store.DB_PATH} — sessions and documents survive restart`);
  console.log(`[CORS]    ${allowAnyOrigin ? 'any origin (*)' : CORS_ORIGIN.join(', ')}`);
  console.log(`[HEALTH]  GET /health`);
});

module.exports = { app, server, io };
