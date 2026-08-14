/**
 * STORE.JS — durable session metadata.
 *
 * The document itself (strokes, shapes, text, comments) lives in a Yjs document persisted by
 * Hocuspocus into the `documents` table of the same SQLite file. This module owns everything
 * that must stay *server-authoritative* and therefore cannot live in the CRDT:
 *
 *   - who created a board
 *   - what role each member holds
 *
 * Roles cannot be stored in the Y.Doc, because any client with write access to the document
 * could then edit its own role. Keeping them here means the server is the only writer, and
 * the read-only flag applied to viewers at connection time cannot be escalated by the client.
 *
 * Replaces `const sessions = new Map()`, which lost every session on restart and — worse —
 * deleted sessions outright when the last user disconnected.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'collab.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    creator     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_members (
    session_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL,
    joined_at   INTEGER NOT NULL,
    PRIMARY KEY (session_id, user_id)
  );
`);

const stmt = {
  insertSession: db.prepare(
    `INSERT INTO sessions (id, name, creator, created_at, updated_at)
     VALUES (@id, @name, @creator, @created_at, @updated_at)`
  ),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  touchSession: db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?'),
  setCreator: db.prepare('UPDATE sessions SET creator = ?, updated_at = ? WHERE id = ?'),
  upsertMember: db.prepare(
    `INSERT INTO session_members (session_id, user_id, role, joined_at)
     VALUES (@session_id, @user_id, @role, @joined_at)
     ON CONFLICT(session_id, user_id) DO UPDATE SET role = @role`
  ),
  setRole: db.prepare(
    'UPDATE session_members SET role = ? WHERE session_id = ? AND user_id = ?'
  ),
  getMember: db.prepare(
    'SELECT * FROM session_members WHERE session_id = ? AND user_id = ?'
  ),
  listMembers: db.prepare('SELECT * FROM session_members WHERE session_id = ?'),
  deleteMember: db.prepare(
    'DELETE FROM session_members WHERE session_id = ? AND user_id = ?'
  ),
  countSessions: db.prepare('SELECT COUNT(*) AS n FROM sessions'),
};

/** Create a board. Returns its row. */
function createSession(id, creator) {
  const now = Date.now();
  stmt.insertSession.run({
    id,
    name: `Session ${id.slice(0, 6)}`,
    creator: creator || null,
    created_at: now,
    updated_at: now,
  });
  return stmt.getSession.get(id);
}

function getSession(id) {
  return stmt.getSession.get(id) || null;
}

function sessionExists(id) {
  return !!stmt.getSession.get(id);
}

/**
 * Record or update a member's role.
 *
 * Note this is *membership*, not presence. A member who disconnects keeps their role, so
 * reopening a board restores the permissions they had — the whole point of persisting this.
 * Live presence is tracked separately, in Awareness.
 */
function setMemberRole(sessionId, userId, role) {
  stmt.upsertMember.run({
    session_id: sessionId,
    user_id: userId,
    role,
    joined_at: Date.now(),
  });
  stmt.touchSession.run(Date.now(), sessionId);
}

function getMemberRole(sessionId, userId) {
  return stmt.getMember.get(sessionId, userId)?.role || null;
}

function listMembers(sessionId) {
  const rows = stmt.listMembers.all(sessionId);
  const out = {};
  for (const r of rows) out[r.user_id] = { role: r.role, joinedAt: r.joined_at };
  return out;
}

function removeMember(sessionId, userId) {
  stmt.deleteMember.run(sessionId, userId);
}

function setCreator(sessionId, userId) {
  stmt.setCreator.run(userId, Date.now(), sessionId);
}

function sessionCount() {
  return stmt.countSessions.get().n;
}

module.exports = {
  db,
  DB_PATH,
  createSession,
  getSession,
  sessionExists,
  setMemberRole,
  getMemberRole,
  listMembers,
  removeMember,
  setCreator,
  sessionCount,
};
