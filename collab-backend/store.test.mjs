/**
 * store.js — durable session metadata.
 *
 * The property under test is the one whose absence made persistence meaningless in the first
 * place: a member's role must outlive their connection. Membership used to be keyed by
 * socket.id, which is minted fresh on every connect, so a creator reloading the page came
 * back to their own board as a viewer.
 *
 * Runs against a real SQLite file in a temp directory, not a mock. A mock of a database
 * cannot tell you whether your schema and your queries agree.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let store;
let tmpDir;

beforeAll(() => {
  // DATABASE_PATH must be set BEFORE store.js is first loaded — it reads it at module scope.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-store-test-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
  store = require('./store.js');
});

afterAll(() => {
  try { store.db.close(); } catch { /* already closed */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sessions', () => {
  it('creates and reads back a session', () => {
    const row = store.createSession('sess_alpha', 'client-1');
    expect(row.id).toBe('sess_alpha');
    expect(row.creator).toBe('client-1');
    expect(store.sessionExists('sess_alpha')).toBe(true);
  });

  it('reports a missing session as missing rather than throwing', () => {
    expect(store.sessionExists('sess_nope')).toBe(false);
    expect(store.getSession('sess_nope')).toBeNull();
  });

  it('counts sessions', () => {
    const before = store.sessionCount();
    store.createSession('sess_beta', 'client-1');
    expect(store.sessionCount()).toBe(before + 1);
  });
});

describe('membership survives disconnection', () => {
  it('remembers a role for a client id across lookups', () => {
    store.createSession('sess_roles', 'creator-client');
    store.setMemberRole('sess_roles', 'creator-client', 'creator');
    store.setMemberRole('sess_roles', 'guest-client', 'viewer');

    // Simulates the client coming back on an entirely new connection.
    expect(store.getMemberRole('sess_roles', 'creator-client')).toBe('creator');
    expect(store.getMemberRole('sess_roles', 'guest-client')).toBe('viewer');
  });

  it('is scoped per session — the same client can hold different roles on different boards', () => {
    store.createSession('sess_a', 'x');
    store.createSession('sess_b', 'y');
    store.setMemberRole('sess_a', 'person', 'creator');
    store.setMemberRole('sess_b', 'person', 'viewer');

    expect(store.getMemberRole('sess_a', 'person')).toBe('creator');
    expect(store.getMemberRole('sess_b', 'person')).toBe('viewer');
  });

  it('returns null for a non-member — the doc server relies on this to refuse tokens', () => {
    store.createSession('sess_closed', 'owner');
    expect(store.getMemberRole('sess_closed', 'a-stranger')).toBeNull();
  });

  it('updates rather than duplicating on a role change', () => {
    store.createSession('sess_promote', 'owner');
    store.setMemberRole('sess_promote', 'guest', 'viewer');
    store.setMemberRole('sess_promote', 'guest', 'editor');

    const members = store.listMembers('sess_promote');
    expect(Object.keys(members)).toEqual(['guest']);
    expect(members.guest.role).toBe('editor');
  });

  it('removes a member cleanly', () => {
    store.createSession('sess_remove', 'owner');
    store.setMemberRole('sess_remove', 'guest', 'viewer');
    store.removeMember('sess_remove', 'guest');
    expect(store.getMemberRole('sess_remove', 'guest')).toBeNull();
  });
});

describe('persistence across a process restart', () => {
  it('reads back what a previous process wrote', () => {
    store.createSession('sess_restart', 'owner');
    store.setMemberRole('sess_restart', 'owner', 'creator');
    store.db.close();

    // A brand-new module instance against the same file == a new server process.
    delete require.cache[require.resolve('./store.js')];
    const reopened = require('./store.js');

    expect(reopened.sessionExists('sess_restart')).toBe(true);
    expect(reopened.getMemberRole('sess_restart', 'owner')).toBe('creator');

    store = reopened;
  });
});
