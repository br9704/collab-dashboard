/**
 * roles.js — the permission matrix.
 *
 * This is the highest-value module to test in the whole repo: it is pure, it is small, and
 * it is the thing standing between a viewer and someone else's board. It had zero tests
 * against eleven TEST_REPORT_*.md files.
 *
 * The tests are written against the *properties* the matrix must hold rather than against a
 * transcription of the table — a test that restates the implementation line for line passes
 * whenever the implementation changes, which is exactly when you want it to fail.
 */

import { describe, it, expect } from 'vitest';
// roles.js is CommonJS; Node's interop hands the whole module.exports back as the default.
import rolesModule from './roles.js';

const {
  ROLES,
  PERMISSIONS,
  canPerformAction,
  getPermittedActions,
  getDefaultRole,
  getCreatorRole,
} = rolesModule;

const ALL_ROLES = Object.values(ROLES);
const ALL_ACTIONS = Object.keys(PERMISSIONS);

describe('role constants', () => {
  it('defines exactly three roles', () => {
    expect(ALL_ROLES.sort()).toEqual(['creator', 'editor', 'viewer']);
  });

  it('defaults new joiners to the LEAST privileged role', () => {
    const permitted = ALL_ROLES.map((r) => getPermittedActions(r).length);
    expect(getPermittedActions(getDefaultRole()).length).toBe(Math.min(...permitted));
  });

  it('gives the creator role the MOST privilege', () => {
    const permitted = ALL_ROLES.map((r) => getPermittedActions(r).length);
    expect(getPermittedActions(getCreatorRole()).length).toBe(Math.max(...permitted));
  });
});

describe('canPerformAction', () => {
  it('covers every role for every action — no undefined cells in the matrix', () => {
    for (const action of ALL_ACTIONS) {
      for (const role of ALL_ROLES) {
        expect(
          typeof PERMISSIONS[action][role],
          `${action} × ${role} is not defined`
        ).toBe('boolean');
      }
    }
  });

  it('denies unknown actions rather than defaulting to allow', () => {
    // Fail closed. A typo in an action name must not become a permission.
    expect(canPerformAction(ROLES.CREATOR, 'delete-the-internet')).toBe(false);
    expect(canPerformAction(ROLES.CREATOR, '')).toBe(false);
    expect(canPerformAction(ROLES.CREATOR, undefined)).toBe(false);
  });

  it('denies unknown roles rather than defaulting to allow', () => {
    for (const action of ALL_ACTIONS) {
      expect(canPerformAction('admin', action)).toBe(false);
      expect(canPerformAction(undefined, action)).toBe(false);
      expect(canPerformAction(null, action)).toBe(false);
      // A truthy-but-wrong role must not slip through a loose comparison.
      expect(canPerformAction('CREATOR', action)).toBe(false);
    }
  });
});

describe('the privilege hierarchy holds', () => {
  it('a creator can do everything an editor can', () => {
    for (const action of ALL_ACTIONS) {
      if (canPerformAction(ROLES.EDITOR, action)) {
        expect(canPerformAction(ROLES.CREATOR, action), action).toBe(true);
      }
    }
  });

  it('an editor can do everything a viewer can', () => {
    for (const action of ALL_ACTIONS) {
      if (canPerformAction(ROLES.VIEWER, action)) {
        expect(canPerformAction(ROLES.EDITOR, action), action).toBe(true);
      }
    }
  });
});

describe('the viewer boundary — the whole point of the model', () => {
  const MUTATING = [
    'draw-stroke', 'draw-shape', 'add-text', 'edit-text', 'delete-text', 'undo', 'redo',
  ];

  it('a viewer cannot change the board in any way', () => {
    for (const action of MUTATING) {
      expect(canPerformAction(ROLES.VIEWER, action), action).toBe(false);
    }
  });

  it('a viewer CAN comment — read-only is not silent', () => {
    expect(canPerformAction(ROLES.VIEWER, 'add-comment')).toBe(true);
  });

  it('only the creator can change roles or delete the session', () => {
    for (const action of ['change-user-role', 'remove-user', 'delete-session']) {
      expect(canPerformAction(ROLES.CREATOR, action), action).toBe(true);
      expect(canPerformAction(ROLES.EDITOR, action), action).toBe(false);
      expect(canPerformAction(ROLES.VIEWER, action), action).toBe(false);
    }
  });
});

describe('getPermittedActions', () => {
  it('agrees with canPerformAction for every role', () => {
    for (const role of ALL_ROLES) {
      const listed = new Set(getPermittedActions(role));
      for (const action of ALL_ACTIONS) {
        expect(listed.has(action), `${role} / ${action}`).toBe(canPerformAction(role, action));
      }
    }
  });

  it('returns an empty list for an unknown role', () => {
    expect(getPermittedActions('nobody')).toEqual([]);
  });
});
