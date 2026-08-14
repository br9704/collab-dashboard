/**
 * INTEGRATION — the regression that must never return.
 *
 * The original blocker: the server broadcasts session state to the room BEFORE invoking the
 * session-create acknowledgement, so a client that waits for the broadcast can never receive
 * it — it has not subscribed yet. The creator fell back to `viewer` and could not draw on
 * their own board, and presence read ONLINE (0). Two symptoms, one race.
 *
 * This test drives a real server over a real socket, both ways round:
 *
 *   ACK-SEEDED  — what the fixed client does. Must report `creator`.
 *   LISTENER-AFTER-EMIT — what the broken client did. Documents the race, and is the
 *                 reason the fix must stay: it shows the broadcast genuinely arrives too
 *                 late, so any future "just listen for it" refactor reintroduces the bug.
 *
 * It also covers the second half of the same fix: identity is a stable client id, not
 * socket.id, so a member's role survives reconnection.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { io as ioClient } from 'socket.io-client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let server;
let PORT;
let tmpDir;

const connect = () => new Promise((resolve) => {
  const s = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
});

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-integration-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
  process.env.PORT = '0';   // let the OS pick a free port

  const mod = require('./server.js');
  server = mod.server;

  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
  PORT = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('THE RACE — session state must come from the ack', () => {
  it('the ack carries the creator role', async () => {
    const socket = await connect();
    const ack = await emit(socket, 'session-create', { clientId: 'race-creator' });

    expect(ack.role).toBe('creator');
    expect(ack.session.sessionMembers['race-creator'].role).toBe('creator');
    socket.disconnect();
  });

  it('the ack counts the creator in presence — not ONLINE (0)', async () => {
    const socket = await connect();
    const ack = await emit(socket, 'session-create', { clientId: 'race-presence' });

    expect(ack.session.users).toContain('race-presence');
    expect(ack.session.users).toHaveLength(1);
    socket.disconnect();
  });

  it('DOCUMENTS THE RACE: a listener registered after the emit never sees the broadcast', async () => {
    // This is the exact shape of the original bug. If a future refactor moves initial state
    // back onto the broadcast, this test still passes but the two above start failing —
    // which is precisely the signal we want.
    const socket = await connect();

    let broadcastSeen = false;
    const ack = await new Promise((resolve) => {
      socket.emit('session-create', { clientId: 'race-late' }, (response) => {
        // Subscribing only now, exactly as the broken client did.
        socket.on('session-updated', () => { broadcastSeen = true; });
        resolve(response);
      });
    });

    await wait(300);

    expect(broadcastSeen).toBe(false);           // the broadcast is genuinely gone
    expect(ack.session.sessionMembers['race-late'].role).toBe('creator'); // the ack is not
    socket.disconnect();
  });

  it('gives a joiner the viewer role, and both clients see two users', async () => {
    const a = await connect();
    const ackA = await emit(a, 'session-create', { clientId: 'pair-a' });

    let aSaw = null;
    a.on('session-updated', (view) => { aSaw = view; });

    const b = await connect();
    const ackB = await emit(b, 'session-join', {
      sessionId: ackA.sessionId, clientId: 'pair-b',
    });
    await wait(200);

    expect(ackB.role).toBe('viewer');
    expect(ackB.session.users).toHaveLength(2);
    expect(aSaw?.users).toHaveLength(2);
    expect(aSaw?.sessionMembers['pair-a'].role).toBe('creator');

    a.disconnect();
    b.disconnect();
  });
});

describe('identity is stable across connections, not socket.id', () => {
  it('a returning client keeps its role on a brand-new socket', async () => {
    const first = await connect();
    const ack = await emit(first, 'session-create', { clientId: 'returning-user' });
    const sessionId = ack.sessionId;
    const firstSocketId = first.id;
    first.disconnect();
    await wait(200);

    const second = await connect();
    const rejoin = await emit(second, 'session-join', {
      sessionId, clientId: 'returning-user',
    });

    // A different transport connection entirely...
    expect(second.id).not.toBe(firstSocketId);
    // ...but the same person, so the same role.
    expect(rejoin.role).toBe('creator');
    second.disconnect();
  });

  it('an unknown client joining an existing board is a viewer', async () => {
    const owner = await connect();
    const ack = await emit(owner, 'session-create', { clientId: 'owner-x' });

    const stranger = await connect();
    const joined = await emit(stranger, 'session-join', {
      sessionId: ack.sessionId, clientId: 'stranger-x',
    });

    expect(joined.role).toBe('viewer');
    owner.disconnect();
    stranger.disconnect();
  });
});

describe('the board outlives its participants', () => {
  it('a session is NOT deleted when the last user leaves', async () => {
    // The old server called deleteSession() as soon as the room emptied, so a board could
    // not outlive its participants even in principle. Persistence was not merely missing;
    // it was structurally impossible.
    const socket = await connect();
    const ack = await emit(socket, 'session-create', { clientId: 'ephemeral-user' });
    socket.disconnect();
    await wait(400);

    const later = await connect();
    const rejoined = await emit(later, 'session-join', {
      sessionId: ack.sessionId, clientId: 'someone-else',
    });

    expect(rejoined.error).toBeUndefined();
    expect(rejoined.sessionId).toBe(ack.sessionId);
    later.disconnect();
  });
});

describe('role changes are creator-only', () => {
  it('a viewer cannot promote itself', async () => {
    const creator = await connect();
    const ack = await emit(creator, 'session-create', { clientId: 'rc-creator' });

    const viewer = await connect();
    await emit(viewer, 'session-join', { sessionId: ack.sessionId, clientId: 'rc-viewer' });

    viewer.emit('role-change', { userId: 'rc-viewer', newRole: 'creator' });
    await wait(300);

    const check = await connect();
    const view = await emit(check, 'session-join', {
      sessionId: ack.sessionId, clientId: 'rc-observer',
    });
    expect(view.session.sessionMembers['rc-viewer'].role).toBe('viewer');

    creator.disconnect();
    viewer.disconnect();
    check.disconnect();
  });

  it('the creator CAN promote a viewer, and says the doc must reconnect', async () => {
    const creator = await connect();
    const ack = await emit(creator, 'session-create', { clientId: 'rc2-creator' });

    const viewer = await connect();
    await emit(viewer, 'session-join', { sessionId: ack.sessionId, clientId: 'rc2-viewer' });

    const updated = await new Promise((resolve) => {
      viewer.on('role-updated', resolve);
      creator.emit('role-change', { userId: 'rc2-viewer', newRole: 'editor' });
    });

    expect(updated.newRole).toBe('editor');
    // A Hocuspocus connection's read-only flag is fixed for its lifetime, so the client
    // has to reopen the document for a promotion to take effect.
    expect(updated.requiresDocReconnect).toBe(true);

    creator.disconnect();
    viewer.disconnect();
  });
});

describe('HTTP surface', () => {
  it('serves a health check — there were zero HTTP routes before', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.persistence).toBe('sqlite');
    expect(typeof body.sessions).toBe('number');
  });
});
