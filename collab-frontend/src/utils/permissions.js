/**
 * Advanced permission system for granular access control
 * Manages user roles, capabilities, and resource-specific permissions
 */

/**
 * Base role definitions with default capabilities
 */
export const BASE_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  COMMENTER: 'commenter',
  VIEWER: 'viewer'
};

/**
 * Granular permission flags
 * Can be assigned individually for fine-grained control
 */
export const PERMISSIONS = {
  // Canvas operations
  DRAW: 'canvas:draw',
  ERASE: 'canvas:erase',
  CREATE_SHAPES: 'canvas:create-shapes',
  DELETE_SHAPES: 'canvas:delete-shapes',
  MODIFY_SHAPES: 'canvas:modify-shapes',
  CREATE_TEXT: 'canvas:create-text',
  DELETE_TEXT: 'canvas:delete-text',
  MODIFY_TEXT: 'canvas:modify-text',

  // Layer management
  CREATE_LAYERS: 'layers:create',
  DELETE_LAYERS: 'layers:delete',
  MODIFY_LAYERS: 'layers:modify',
  HIDE_LAYERS: 'layers:hide',

  // Collaboration
  CREATE_COMMENTS: 'collab:comment',
  DELETE_COMMENTS: 'collab:delete-comment',
  CREATE_MENTIONS: 'collab:mention',
  RESOLVE_COMMENTS: 'collab:resolve-comment',

  // Session management
  MANAGE_USERS: 'session:manage-users',
  KICK_USERS: 'session:kick-users',
  CHANGE_PERMISSIONS: 'session:change-permissions',
  LOCK_CANVAS: 'session:lock-canvas',

  // File operations
  SAVE_FILE: 'file:save',
  EXPORT_FILE: 'file:export',
  DELETE_FILE: 'file:delete',
  SHARE_FILE: 'file:share',

  // Undo/Redo
  UNDO: 'history:undo',
  REDO: 'history:redo',

  // AI features
  USE_AI_COMPLETION: 'ai:completion',
  USE_TEMPLATES: 'templates:use',
  EMBED_VIDEO: 'media:embed-video'
};

/**
 * Role permission mappings
 * Defines which permissions each role has by default
 */
export const ROLE_PERMISSIONS = {
  [BASE_ROLES.OWNER]: [
    // All permissions
    ...Object.values(PERMISSIONS)
  ],

  [BASE_ROLES.EDITOR]: [
    PERMISSIONS.DRAW,
    PERMISSIONS.ERASE,
    PERMISSIONS.CREATE_SHAPES,
    PERMISSIONS.DELETE_SHAPES,
    PERMISSIONS.MODIFY_SHAPES,
    PERMISSIONS.CREATE_TEXT,
    PERMISSIONS.DELETE_TEXT,
    PERMISSIONS.MODIFY_TEXT,
    PERMISSIONS.CREATE_LAYERS,
    PERMISSIONS.DELETE_LAYERS,
    PERMISSIONS.MODIFY_LAYERS,
    PERMISSIONS.HIDE_LAYERS,
    PERMISSIONS.CREATE_COMMENTS,
    PERMISSIONS.DELETE_COMMENTS,
    PERMISSIONS.CREATE_MENTIONS,
    PERMISSIONS.RESOLVE_COMMENTS,
    PERMISSIONS.SAVE_FILE,
    PERMISSIONS.EXPORT_FILE,
    PERMISSIONS.UNDO,
    PERMISSIONS.REDO,
    PERMISSIONS.USE_AI_COMPLETION,
    PERMISSIONS.USE_TEMPLATES,
    PERMISSIONS.EMBED_VIDEO
  ],

  [BASE_ROLES.COMMENTER]: [
    PERMISSIONS.CREATE_COMMENTS,
    PERMISSIONS.DELETE_COMMENTS,
    PERMISSIONS.CREATE_MENTIONS,
    PERMISSIONS.USE_TEMPLATES,
    PERMISSIONS.USE_AI_COMPLETION
  ],

  [BASE_ROLES.VIEWER]: [
    // Minimal permissions - view only
  ]
};

/**
 * User permission record
 * Can override base role permissions for individuals
 */
export class UserPermissions {
  constructor(userId, baseRole = BASE_ROLES.VIEWER) {
    this.userId = userId;
    this.baseRole = baseRole;
    this.permissions = new Set(ROLE_PERMISSIONS[baseRole] || []);
    this.deniedPermissions = new Set();
    this.resourcePermissions = new Map(); // Resource ID -> Set of permissions
  }

  /**
   * Grant a permission to user
   */
  grant(permission) {
    this.permissions.add(permission);
    this.deniedPermissions.delete(permission);
  }

  /**
   * Revoke a permission from user
   */
  revoke(permission) {
    this.permissions.delete(permission);
    this.deniedPermissions.add(permission);
  }

  /**
   * Grant multiple permissions
   */
  grantAll(permissions) {
    permissions.forEach(p => this.grant(p));
  }

  /**
   * Revoke multiple permissions
   */
  revokeAll(permissions) {
    permissions.forEach(p => this.revoke(p));
  }

  /**
   * Check if user has permission
   */
  has(permission) {
    // Check deny list first
    if (this.deniedPermissions.has(permission)) {
      return false;
    }
    return this.permissions.has(permission);
  }

  /**
   * Check if user has any of the given permissions
   */
  hasAny(permissions) {
    return permissions.some(p => this.has(p));
  }

  /**
   * Check if user has all of the given permissions
   */
  hasAll(permissions) {
    return permissions.every(p => this.has(p));
  }

  /**
   * Grant permission on specific resource
   */
  grantOnResource(resourceId, permission) {
    if (!this.resourcePermissions.has(resourceId)) {
      this.resourcePermissions.set(resourceId, new Set());
    }
    this.resourcePermissions.get(resourceId).add(permission);
  }

  /**
   * Revoke permission on specific resource
   */
  revokeOnResource(resourceId, permission) {
    if (!this.resourcePermissions.has(resourceId)) {
      return;
    }
    this.resourcePermissions.get(resourceId).delete(permission);
  }

  /**
   * Check if user has permission on specific resource
   */
  hasOnResource(resourceId, permission) {
    // Check global permission first
    if (this.has(permission)) {
      return true;
    }

    // Check resource-specific permission
    if (this.resourcePermissions.has(resourceId)) {
      return this.resourcePermissions.get(resourceId).has(permission);
    }

    return false;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      userId: this.userId,
      baseRole: this.baseRole,
      permissions: Array.from(this.permissions),
      deniedPermissions: Array.from(this.deniedPermissions),
      resourcePermissions: Array.from(this.resourcePermissions.entries()).map(
        ([resourceId, perms]) => ({
          resourceId,
          permissions: Array.from(perms)
        })
      )
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data) {
    const user = new UserPermissions(data.userId, data.baseRole);
    user.permissions = new Set(data.permissions);
    user.deniedPermissions = new Set(data.deniedPermissions);
    user.resourcePermissions = new Map(
      data.resourcePermissions.map(({ resourceId, permissions }) => [
        resourceId,
        new Set(permissions)
      ])
    );
    return user;
  }
}

/**
 * Permission manager for session
 * Manages permissions for all users in a session
 */
export class SessionPermissionManager {
  constructor() {
    this.users = new Map(); // userId -> UserPermissions
    this.inheritanceChain = new Map(); // userId -> Set of inherited-from users
  }

  /**
   * Register a user
   */
  registerUser(userId, baseRole = BASE_ROLES.VIEWER) {
    this.users.set(userId, new UserPermissions(userId, baseRole));
  }

  /**
   * Get user permissions
   */
  getUser(userId) {
    return this.users.get(userId);
  }

  /**
   * Set user role
   */
  setUserRole(userId, role) {
    if (!this.users.has(userId)) {
      this.registerUser(userId, role);
    } else {
      const user = this.users.get(userId);
      user.baseRole = role;
      user.permissions = new Set(ROLE_PERMISSIONS[role] || []);
    }
  }

  /**
   * Grant permission to user
   */
  grantPermission(userId, permission) {
    if (!this.users.has(userId)) {
      this.registerUser(userId);
    }
    this.users.get(userId).grant(permission);
  }

  /**
   * Revoke permission from user
   */
  revokePermission(userId, permission) {
    if (!this.users.has(userId)) {
      return;
    }
    this.users.get(userId).revoke(permission);
  }

  /**
   * Grant role-based permissions (for specific capability set)
   */
  grantRolePermissions(userId, role) {
    if (!this.users.has(userId)) {
      this.registerUser(userId, role);
    }
    const user = this.users.get(userId);
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    user.grantAll(rolePerms);
  }

  /**
   * Check if user can perform action
   */
  canUser(userId, permission) {
    const user = this.users.get(userId);
    return user ? user.has(permission) : false;
  }

  /**
   * Check if user can perform action on resource
   */
  canUserOnResource(userId, resourceId, permission) {
    const user = this.users.get(userId);
    return user ? user.hasOnResource(resourceId, permission) : false;
  }

  /**
   * Get all users with specific permission
   */
  getUsersWithPermission(permission) {
    return Array.from(this.users.values())
      .filter(user => user.has(permission))
      .map(user => user.userId);
  }

  /**
   * Get user summary for debugging/display
   */
  getUserSummary(userId) {
    const user = this.users.get(userId);
    if (!user) return null;

    return {
      userId,
      baseRole: user.baseRole,
      grantedPermissions: Array.from(user.permissions),
      deniedPermissions: Array.from(user.deniedPermissions),
      resourcePermissions: Array.from(user.resourcePermissions.entries()).map(
        ([resourceId, perms]) => ({
          resourceId,
          permissions: Array.from(perms)
        })
      )
    };
  }

  /**
   * Export all permissions for backup/sharing
   */
  exportPermissions() {
    return Array.from(this.users.entries()).map(([userId, user]) => ({
      userId,
      permissions: user.toJSON()
    }));
  }
}

/**
 * Helper function to check multiple users' permissions
 */
export function checkCollaboratorAccess(permissionManager, userIds, permission) {
  return userIds.map(userId => ({
    userId,
    canAccess: permissionManager.canUser(userId, permission)
  }));
}
