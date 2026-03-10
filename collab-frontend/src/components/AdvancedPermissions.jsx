import { useState } from 'react';
import { BASE_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../utils/permissions';
import './AdvancedPermissions.css';

/**
 * AdvancedPermissions - Granular permission management UI
 * Allows fine-grained control over user access to features and resources
 * 
 * Features:
 * - Role-based access control (Owner, Editor, Commenter, Viewer)
 * - Individual permission grants/revokes
 * - Resource-specific permissions
 * - Permission audit trail
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.users - Array of user objects
 * @param {Object} props.permissionManager - Permission manager instance
 * @param {Function} props.onPermissionChange - Callback when permissions change
 * @returns {React.ReactElement}
 */
export default function AdvancedPermissions({ users, permissionManager, onPermissionChange }) {
  const [selectedUserId, setSelectedUserId] = useState(users?.[0]?.id);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedUser = users?.find(u => u.id === selectedUserId);
  const selectedUserPerms = selectedUser && permissionManager 
    ? permissionManager.getUser(selectedUserId)
    : null;

  /**
   * Handle role change
   */
  const handleRoleChange = (newRole) => {
    if (permissionManager && selectedUserId) {
      permissionManager.setUserRole(selectedUserId, newRole);
      onPermissionChange?.({
        userId: selectedUserId,
        action: 'role-changed',
        newRole
      });
    }
  };

  /**
   * Handle individual permission toggle
   */
  const handlePermissionToggle = (permission) => {
    if (!permissionManager || !selectedUserId) return;

    const user = permissionManager.getUser(selectedUserId);
    if (user.has(permission)) {
      permissionManager.revokePermission(selectedUserId, permission);
    } else {
      permissionManager.grantPermission(selectedUserId, permission);
    }

    onPermissionChange?.({
      userId: selectedUserId,
      action: 'permission-toggled',
      permission,
      granted: user.has(permission)
    });
  };

  /**
   * Toggle permission group expansion
   */
  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  /**
   * Group permissions by category
   */
  const permissionGroups = {
    'Canvas': [
      PERMISSIONS.DRAW,
      PERMISSIONS.ERASE,
      PERMISSIONS.CREATE_SHAPES,
      PERMISSIONS.DELETE_SHAPES,
      PERMISSIONS.MODIFY_SHAPES,
      PERMISSIONS.CREATE_TEXT,
      PERMISSIONS.DELETE_TEXT,
      PERMISSIONS.MODIFY_TEXT
    ],
    'Layers': [
      PERMISSIONS.CREATE_LAYERS,
      PERMISSIONS.DELETE_LAYERS,
      PERMISSIONS.MODIFY_LAYERS,
      PERMISSIONS.HIDE_LAYERS
    ],
    'Collaboration': [
      PERMISSIONS.CREATE_COMMENTS,
      PERMISSIONS.DELETE_COMMENTS,
      PERMISSIONS.CREATE_MENTIONS,
      PERMISSIONS.RESOLVE_COMMENTS
    ],
    'Session': [
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.KICK_USERS,
      PERMISSIONS.CHANGE_PERMISSIONS,
      PERMISSIONS.LOCK_CANVAS
    ],
    'Files': [
      PERMISSIONS.SAVE_FILE,
      PERMISSIONS.EXPORT_FILE,
      PERMISSIONS.DELETE_FILE,
      PERMISSIONS.SHARE_FILE
    ],
    'History': [
      PERMISSIONS.UNDO,
      PERMISSIONS.REDO
    ],
    'AI & Features': [
      PERMISSIONS.USE_AI_COMPLETION,
      PERMISSIONS.USE_TEMPLATES,
      PERMISSIONS.EMBED_VIDEO
    ]
  };

  return (
    <div className="advanced-permissions-panel">
      <div className="permissions-header">
        <h3>Permissions</h3>
        <button
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          title="Toggle advanced view"
        >
          {showAdvanced ? '▼' : '▶'} Advanced
        </button>
      </div>

      {/* User selector */}
      <div className="user-selector-group">
        <label htmlFor="user-select">Select User</label>
        <select
          id="user-select"
          value={selectedUserId || ''}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="user-select"
        >
          {users?.map(user => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </div>

      {selectedUser && selectedUserPerms && (
        <>
          {/* Role selector */}
          <div className="role-selector-group">
            <label>Role</label>
            <div className="role-buttons">
              {Object.values(BASE_ROLES).map(role => (
                <button
                  key={role}
                  className={`role-button ${selectedUserPerms.baseRole === role ? 'active' : ''}`}
                  onClick={() => handleRoleChange(role)}
                  title={`Change to ${role} role`}
                >
                  {formatRoleName(role)}
                </button>
              ))}
            </div>
          </div>

          {/* Role description */}
          <div className="role-description">
            {getRoleDescription(selectedUserPerms.baseRole)}
          </div>

          {/* Permission groups (advanced mode) */}
          {showAdvanced && (
            <div className="permission-groups">
              {Object.entries(permissionGroups).map(([group, permissions]) => (
                <div key={group} className="permission-group">
                  <button
                    className="group-toggle"
                    onClick={() => toggleGroup(group)}
                  >
                    <span className="toggle-arrow">
                      {expandedGroups[group] ? '▼' : '▶'}
                    </span>
                    <span className="group-name">{group}</span>
                    <span className="group-count">
                      ({permissions.filter(p => selectedUserPerms.has(p)).length}/{permissions.length})
                    </span>
                  </button>

                  {expandedGroups[group] && (
                    <div className="permission-list">
                      {permissions.map(permission => (
                        <label key={permission} className="permission-item">
                          <input
                            type="checkbox"
                            checked={selectedUserPerms.has(permission)}
                            onChange={() => handlePermissionToggle(permission)}
                            className="permission-checkbox"
                          />
                          <span className="permission-label">
                            {formatPermissionName(permission)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick stats */}
          <div className="permission-stats">
            <div className="stat">
              <div className="stat-label">Total Permissions</div>
              <div className="stat-value">
                {selectedUserPerms.permissions.size}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Role</div>
              <div className="stat-value">
                {formatRoleName(selectedUserPerms.baseRole)}
              </div>
            </div>
          </div>
        </>
      )}

      {!selectedUser && (
        <div className="no-selection">
          Select a user to manage permissions
        </div>
      )}
    </div>
  );
}

/**
 * Format role name for display
 */
function formatRoleName(role) {
  const names = {
    owner: '👑 Owner',
    editor: '✏️ Editor',
    commenter: '💬 Commenter',
    viewer: '👁️ Viewer'
  };
  return names[role] || role;
}

/**
 * Get role description
 */
function getRoleDescription(role) {
  const descriptions = {
    owner: 'Full access to all features and settings',
    editor: 'Can create and modify content, manage collaboration',
    commenter: 'Can view and comment, use AI features',
    viewer: 'Read-only access to canvas'
  };
  return descriptions[role] || '';
}

/**
 * Format permission name for display
 */
function formatPermissionName(permission) {
  const names = {
    'canvas:draw': 'Draw on canvas',
    'canvas:erase': 'Erase content',
    'canvas:create-shapes': 'Create shapes',
    'canvas:delete-shapes': 'Delete shapes',
    'canvas:modify-shapes': 'Modify shapes',
    'canvas:create-text': 'Create text',
    'canvas:delete-text': 'Delete text',
    'canvas:modify-text': 'Modify text',
    'layers:create': 'Create layers',
    'layers:delete': 'Delete layers',
    'layers:modify': 'Modify layers',
    'layers:hide': 'Hide/show layers',
    'collab:comment': 'Create comments',
    'collab:delete-comment': 'Delete comments',
    'collab:mention': 'Mention users',
    'collab:resolve-comment': 'Resolve comments',
    'session:manage-users': 'Manage users',
    'session:kick-users': 'Remove users',
    'session:change-permissions': 'Change permissions',
    'session:lock-canvas': 'Lock canvas',
    'file:save': 'Save files',
    'file:export': 'Export files',
    'file:delete': 'Delete files',
    'file:share': 'Share files',
    'history:undo': 'Undo changes',
    'history:redo': 'Redo changes',
    'ai:completion': 'Use AI completion',
    'templates:use': 'Use templates',
    'media:embed-video': 'Embed videos'
  };
  return names[permission] || permission;
}
