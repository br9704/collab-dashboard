/**
 * ROLES.JS - Role Constants and Permission Management
 * 
 * Defines the role hierarchy and permission model for the collaborative dashboard.
 * 
 * Role Hierarchy:
 *   CREATOR (highest)
 *     - Can create sessions
 *     - Can draw, edit text, create shapes
 *     - Can invite and manage other users
 *     - Can export/save session
 *     - Can delete/archive session
 *   
 *   EDITOR (mid)
 *     - Can draw, edit text, create shapes
 *     - Cannot manage users
 *     - Cannot delete session
 *     - Can see all content
 *   
 *   VIEWER (lowest)
 *     - Can view content only
 *     - Cannot draw or edit
 *     - Cannot delete or modify content
 *     - Read-only access
 */

// Role definitions
const ROLES = {
  CREATOR: 'creator',      // Session creator, full permissions
  EDITOR: 'editor',        // Invited editor, can draw but not manage
  VIEWER: 'viewer'         // Read-only viewer
};

/**
 * Permission matrix defining what each role can do
 * Format: { action: { [ROLE]: boolean } }
 */
const PERMISSIONS = {
  // Drawing and content creation
  'draw-stroke': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  'draw-shape': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  'add-text': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  'edit-text': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  'delete-text': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  
  // User management
  'change-user-role': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: false,
    [ROLES.VIEWER]: false
  },
  'remove-user': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: false,
    [ROLES.VIEWER]: false
  },
  
  // Session management
  'delete-session': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: false,
    [ROLES.VIEWER]: false
  },
  'export-session': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: false,
    [ROLES.VIEWER]: false
  },
  
  // Comments (all can comment)
  'add-comment': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: true
  },
  'resolve-comment': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  
  // Undo/Redo
  'undo': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  },
  'redo': {
    [ROLES.CREATOR]: true,
    [ROLES.EDITOR]: true,
    [ROLES.VIEWER]: false
  }
};

/**
 * Check if a user with given role can perform an action
 * @param {string} userRole - The user's role (CREATOR, EDITOR, VIEWER)
 * @param {string} action - The action to check (e.g., 'draw-stroke')
 * @returns {boolean} True if the action is permitted, false otherwise
 */
function canPerformAction(userRole, action) {
  if (!PERMISSIONS[action]) {
    console.warn(`[PERMISSIONS] Unknown action: ${action}`);
    return false;
  }
  
  return PERMISSIONS[action][userRole] === true;
}

/**
 * Get all actions permitted for a given role
 * @param {string} userRole - The user's role
 * @returns {Array<string>} Array of permitted actions
 */
function getPermittedActions(userRole) {
  const permitted = [];
  
  for (const [action, permissions] of Object.entries(PERMISSIONS)) {
    if (permissions[userRole] === true) {
      permitted.push(action);
    }
  }
  
  return permitted;
}

/**
 * Get the default role for new session joiners
 * @returns {string} Default role (VIEWER)
 */
function getDefaultRole() {
  return ROLES.VIEWER;
}

/**
 * Get the creator role
 * @returns {string} Creator role
 */
function getCreatorRole() {
  return ROLES.CREATOR;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  canPerformAction,
  getPermittedActions,
  getDefaultRole,
  getCreatorRole
};
