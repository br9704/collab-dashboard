import React, { useState } from 'react';
import './RolesPanel.css';

export default function RolesPanel({ socket, users, sessionMembers }) {
  const handleRoleChange = (userId, newRole) => {
    socket?.emit('role-change', { userId, newRole });
  };

  return (
    <div className="roles-panel">
      <div className="roles-header">
        <h3>User Roles</h3>
        <p className="roles-help">Admin • Editor • Viewer</p>
      </div>

      <div className="roles-list">
        {users.map(userId => {
          const member = sessionMembers[userId];
          const currentRole = member?.role || 'viewer';

          return (
            <div key={userId} className="role-item">
              <div className="role-user">
                <span className="user-id">{userId.slice(0, 8)}</span>
                <span className={`role-badge ${currentRole}`}>
                  {currentRole}
                </span>
              </div>

              <div className="role-select">
                <select
                  value={currentRole}
                  onChange={(e) => handleRoleChange(userId, e.target.value)}
                >
                  <option value="admin">👑 Admin</option>
                  <option value="editor">✏️ Editor</option>
                  <option value="viewer">👁️ Viewer</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="roles-info">
        <div className="role-desc">
          <strong>Admin:</strong> Full access, manage roles
        </div>
        <div className="role-desc">
          <strong>Editor:</strong> Can draw and edit
        </div>
        <div className="role-desc">
          <strong>Viewer:</strong> View-only, no editing
        </div>
      </div>
    </div>
  );
}
