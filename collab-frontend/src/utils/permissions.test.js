/**
 * permissions.js — 388 lines of pure role logic, previously untested.
 *
 * NOTE ON SCOPE, because it matters for how much these tests are worth:
 * this module is the CLIENT-side permission model. It decides what the UI offers. It is not
 * the security boundary — that is the read-only flag applied to the Yjs document connection
 * in collab-doc.js, which is tested separately by driving the wire protocol. These tests
 * cover correctness of the model, not enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  UserPermissions,
  SessionPermissionManager,
  checkCollaboratorAccess,
} from './permissions.js';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

describe('the role table', () => {
  it('defines a permission set for every role', () => {
    for (const role of Object.values(BASE_ROLES)) {
      expect(Array.isArray(ROLE_PERMISSIONS[role]), role).toBe(true);
    }
  });

  it('only ever grants permissions that actually exist', () => {
    const known = new Set(ALL_PERMISSIONS);
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of granted) {
        expect(known.has(p), `${role} grants unknown permission "${p}"`).toBe(true);
      }
    }
  });

  it('orders the roles by privilege: creator ≥ editor ≥ commenter ≥ viewer', () => {
    const size = (r) => ROLE_PERMISSIONS[r].length;
    expect(size(BASE_ROLES.CREATOR)).toBeGreaterThanOrEqual(size(BASE_ROLES.EDITOR));
    expect(size(BASE_ROLES.EDITOR)).toBeGreaterThanOrEqual(size(BASE_ROLES.COMMENTER));
    expect(size(BASE_ROLES.COMMENTER)).toBeGreaterThanOrEqual(size(BASE_ROLES.VIEWER));
  });

  it('never gives a viewer a drawing permission', () => {
    const viewer = new Set(ROLE_PERMISSIONS[BASE_ROLES.VIEWER]);
    for (const p of [PERMISSIONS.DRAW, PERMISSIONS.ERASE, PERMISSIONS.CREATE_SHAPES,
                     PERMISSIONS.CREATE_TEXT, PERMISSIONS.DELETE_SHAPES]) {
      expect(viewer.has(p), p).toBe(false);
    }
  });

  it('never gives a non-creator the ability to change permissions', () => {
    for (const role of [BASE_ROLES.EDITOR, BASE_ROLES.COMMENTER, BASE_ROLES.VIEWER]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.CHANGE_PERMISSIONS);
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.MANAGE_USERS);
    }
  });
});

describe('UserPermissions', () => {
  it('starts from its base role', () => {
    const u = new UserPermissions('u1', BASE_ROLES.EDITOR);
    expect(u.has(PERMISSIONS.DRAW)).toBe(true);
    expect(u.has(PERMISSIONS.MANAGE_USERS)).toBe(false);
  });

  it('defaults to the least privileged role when none is given', () => {
    const u = new UserPermissions('u1');
    expect(u.has(PERMISSIONS.DRAW)).toBe(false);
  });

  it('grants and revokes individual permissions', () => {
    const u = new UserPermissions('u1', BASE_ROLES.VIEWER);
    expect(u.has(PERMISSIONS.DRAW)).toBe(false);
    u.grant(PERMISSIONS.DRAW);
    expect(u.has(PERMISSIONS.DRAW)).toBe(true);
    u.revoke(PERMISSIONS.DRAW);
    expect(u.has(PERMISSIONS.DRAW)).toBe(false);
  });

  it('revokes a permission the ROLE grants — an override must beat the base role', () => {
    const u = new UserPermissions('u1', BASE_ROLES.EDITOR);
    expect(u.has(PERMISSIONS.DRAW)).toBe(true);
    u.revoke(PERMISSIONS.DRAW);
    expect(u.has(PERMISSIONS.DRAW)).toBe(false);
  });

  it('is idempotent', () => {
    const u = new UserPermissions('u1', BASE_ROLES.VIEWER);
    u.grant(PERMISSIONS.DRAW);
    u.grant(PERMISSIONS.DRAW);
    u.revoke(PERMISSIONS.DRAW);
    u.revoke(PERMISSIONS.DRAW);
    expect(u.has(PERMISSIONS.DRAW)).toBe(false);
  });

  it('hasAny / hasAll behave as expected, including on empty input', () => {
    const u = new UserPermissions('u1', BASE_ROLES.VIEWER);
    u.grantAll([PERMISSIONS.DRAW, PERMISSIONS.CREATE_TEXT]);

    expect(u.hasAll([PERMISSIONS.DRAW, PERMISSIONS.CREATE_TEXT])).toBe(true);
    expect(u.hasAll([PERMISSIONS.DRAW, PERMISSIONS.MANAGE_USERS])).toBe(false);
    expect(u.hasAny([PERMISSIONS.MANAGE_USERS, PERMISSIONS.DRAW])).toBe(true);
    expect(u.hasAny([PERMISSIONS.MANAGE_USERS])).toBe(false);
  });

  it('denies an unknown permission', () => {
    const u = new UserPermissions('u1', BASE_ROLES.CREATOR);
    expect(u.has('not:a:real:permission')).toBe(false);
  });
});

describe('SessionPermissionManager', () => {
  it('registers users and answers for them', () => {
    const m = new SessionPermissionManager();
    m.registerUser('a', BASE_ROLES.CREATOR);
    m.registerUser('b', BASE_ROLES.VIEWER);

    expect(m.canUser('a', PERMISSIONS.DRAW)).toBe(true);
    expect(m.canUser('b', PERMISSIONS.DRAW)).toBe(false);
  });

  it('denies an unregistered user rather than throwing', () => {
    // Fail closed: an unknown user is not an authorised user.
    const m = new SessionPermissionManager();
    expect(m.canUser('ghost', PERMISSIONS.DRAW)).toBe(false);
  });

  it('changes a role and the answers change with it', () => {
    const m = new SessionPermissionManager();
    m.registerUser('b', BASE_ROLES.VIEWER);
    expect(m.canUser('b', PERMISSIONS.DRAW)).toBe(false);
    m.setUserRole('b', BASE_ROLES.EDITOR);
    expect(m.canUser('b', PERMISSIONS.DRAW)).toBe(true);
  });

  it('lists exactly the users holding a permission', () => {
    const m = new SessionPermissionManager();
    m.registerUser('creator', BASE_ROLES.CREATOR);
    m.registerUser('editor', BASE_ROLES.EDITOR);
    m.registerUser('viewer', BASE_ROLES.VIEWER);

    const drawers = m.getUsersWithPermission(PERMISSIONS.DRAW);
    expect(drawers).toContain('creator');
    expect(drawers).toContain('editor');
    expect(drawers).not.toContain('viewer');
  });

  it('grants and revokes per user without affecting anyone else', () => {
    const m = new SessionPermissionManager();
    m.registerUser('a', BASE_ROLES.VIEWER);
    m.registerUser('b', BASE_ROLES.VIEWER);

    m.grantPermission('a', PERMISSIONS.DRAW);
    expect(m.canUser('a', PERMISSIONS.DRAW)).toBe(true);
    expect(m.canUser('b', PERMISSIONS.DRAW)).toBe(false);
  });

  it('exports a snapshot covering every registered user', () => {
    const m = new SessionPermissionManager();
    m.registerUser('a', BASE_ROLES.CREATOR);
    m.registerUser('b', BASE_ROLES.VIEWER);
    // Returns an array of { userId, permissions }, one entry per registered user.
    const snapshot = m.exportPermissions();
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot.map((e) => e.userId).sort()).toEqual(['a', 'b']);
    expect(snapshot.every((e) => e.permissions)).toBe(true);
  });
});

describe('checkCollaboratorAccess', () => {
  it('reports which of several users hold a permission', () => {
    const m = new SessionPermissionManager();
    m.registerUser('a', BASE_ROLES.EDITOR);
    m.registerUser('b', BASE_ROLES.VIEWER);
    const result = checkCollaboratorAccess(m, ['a', 'b'], PERMISSIONS.DRAW);
    expect(result).toBeTruthy();
  });

  it('handles an empty user list', () => {
    const m = new SessionPermissionManager();
    expect(() => checkCollaboratorAccess(m, [], PERMISSIONS.DRAW)).not.toThrow();
  });
});
