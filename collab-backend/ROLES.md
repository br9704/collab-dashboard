# ROLES.md - Role Model and Permission System

## Overview

The Collab Dashboard uses a three-tier role system to manage user permissions and access control:

1. **CREATOR** - Session creator with full permissions
2. **EDITOR** - Invited contributor with drawing/editing permissions
3. **VIEWER** - Read-only participant with no modification permissions

---

## Role Hierarchy

```
CREATOR (Highest)
├─ All drawing permissions
├─ All editing permissions
├─ User management (change roles, remove users)
├─ Session management (export, delete)
└─ Undo/Redo

    ↓

EDITOR (Middle)
├─ All drawing permissions (strokes, shapes)
├─ All editing permissions (text, objects)
├─ Undo/Redo
└─ Cannot manage users or session

    ↓

VIEWER (Lowest)
├─ View all content
└─ Cannot draw, edit, or manage anything
```

---

## Permission Matrix

### Content Creation & Editing

| Action | CREATOR | EDITOR | VIEWER |
|--------|---------|--------|--------|
| Draw strokes | ✅ | ✅ | ❌ |
| Draw shapes | ✅ | ✅ | ❌ |
| Add text | ✅ | ✅ | ❌ |
| Edit text | ✅ | ✅ | ❌ |
| Delete text | ✅ | ✅ | ❌ |
| Undo | ✅ | ✅ | ❌ |
| Redo | ✅ | ✅ | ❌ |

### Collaboration & Comments

| Action | CREATOR | EDITOR | VIEWER |
|--------|---------|--------|--------|
| Add comments | ✅ | ✅ | ✅ |
| Resolve comments | ✅ | ✅ | ❌ |

### User & Session Management

| Action | CREATOR | EDITOR | VIEWER |
|--------|---------|--------|--------|
| Change user role | ✅ | ❌ | ❌ |
| Remove user from session | ✅ | ❌ | ❌ |
| Delete session | ✅ | ❌ | ❌ |
| Export session | ✅ | ❌ | ❌ |

---

## Role Assignment

### Initial Role Assignment

When a user interacts with a session:

**Session Creator:**
```javascript
socket.on('session-create', (callback) => {
  // Automatically assigned CREATOR role
  session.addUser(userId, ROLES.CREATOR);
  userRole = ROLES.CREATOR;
});
```

**Session Joiner:**
```javascript
socket.on('session-join', (sessionId, callback) => {
  // Automatically assigned VIEWER role (read-only default)
  session.addUser(userId, ROLES.VIEWER);
  userRole = ROLES.VIEWER;
});
```

### Role Changes

Only the CREATOR can change user roles:

```javascript
socket.on('role-change', (data) => {
  // Only CREATOR can execute this
  if (userRole !== ROLES.CREATOR) return;
  
  // Change target user's role
  session.sessionMembers[data.userId].role = data.newRole;
  io.to(sessionId).emit('role-updated', {...});
});
```

---

## Permission Checks

All socket handlers use the `canPerformAction()` function to enforce permissions:

```javascript
const { canPerformAction } = require('./roles');

// Example: Check if user can draw
socket.on('stroke-draw', (data) => {
  if (!canPerformAction(userRole, 'draw-stroke')) {
    console.warn(`Permission denied for ${userRole}`);
    return;
  }
  
  // User has permission, process stroke...
});
```

### Available Actions

#### Drawing
- `draw-stroke` - Draw freehand strokes
- `draw-shape` - Draw geometric shapes

#### Text Editing
- `add-text` - Create new text box
- `edit-text` - Modify existing text
- `delete-text` - Remove text box

#### History
- `undo` - Revert last action
- `redo` - Reapply undone action

#### Comments
- `add-comment` - Add comment to element
- `resolve-comment` - Mark comment as resolved

#### Admin
- `change-user-role` - Change another user's role
- `remove-user` - Remove user from session
- `delete-session` - Delete entire session
- `export-session` - Export session data

---

## Implementation Guide

### Using roles.js in Backend

```javascript
const { ROLES, canPerformAction, getDefaultRole, getCreatorRole } = require('./roles');

// Check if user can perform action
if (canPerformAction(userRole, 'draw-stroke')) {
  // Allow drawing
}

// Get the default role for new joiners
const defaultRole = getDefaultRole(); // Returns ROLES.VIEWER

// Get the creator role
const creatorRole = getCreatorRole(); // Returns ROLES.CREATOR
```

### Using in Frontend (Socket Events)

```javascript
// Receive role update from server
socket.on('user-joined', (data) => {
  const { userId, role, users, sessionState } = data;
  
  // Update UI based on role
  if (role === ROLES.CREATOR) {
    // Show all controls (draw, edit, manage users)
    showCreatorTools();
  } else if (role === ROLES.EDITOR) {
    // Show drawing/editing controls
    showEditorTools();
  } else {
    // Show view-only mode
    showViewerMode();
  }
});

// Listen for role changes
socket.on('role-updated', (data) => {
  const { userId, newRole } = data;
  updateUserRole(userId, newRole);
});
```

---

## Bug Fix: Session Creator Role Assignment

### The Problem (Fixed in Commit e2c2593)

Previously, when a user created a new session, the backend was assigning the correct CREATOR role internally, but **failing to broadcast this to the client**. This caused:

1. User creates session → backend assigns CREATOR role ✅
2. Backend fails to emit 'user-joined' event ❌
3. Frontend has no role information → defaults to VIEWER ❌
4. User sees "VIEWER" label and cannot draw ❌

### The Fix

Added the critical emit statement in `session-create` handler:

```javascript
socket.on('session-create', (callback) => {
  const session = createSession();
  session.creator = userId;
  
  // Assign CREATOR role
  const creatorRole = getCreatorRole(); // ROLES.CREATOR
  session.addUser(userId, creatorRole);
  userRole = creatorRole;
  
  currentSessionId = session.id;
  socket.join(session.id);

  // CRITICAL: Broadcast role to all clients
  io.to(session.id).emit('user-joined', {
    userId,
    role: creatorRole,  // Now frontend receives the role!
    users: Array.from(session.users),
    sessionState: session.toJSON()
  });
  
  callback({ sessionId: session.id, session: session.toJSON() });
});
```

Now the frontend receives the `user-joined` event with the creator's role and can properly initialize the UI.

---

## Testing the Role System

### Test 1: Creator Role on Session Creation

**Setup:** Open two browser windows

**Steps:**
1. Window A: Click "Create Session"
2. Verify Window A shows "CREATOR" role label
3. Verify Window A has all drawing tools enabled
4. Create a stroke in Window A

**Expected Result:** ✅ Drawing tools work, stroke appears in both windows

### Test 2: Joiner Gets VIEWER Role

**Steps:**
1. Window A: Get session ID from created session
2. Window B: Join with session ID
3. Verify Window B shows "VIEWER" role label
4. Try to draw in Window B

**Expected Result:** ✅ Window B cannot draw, drawing tools disabled

### Test 3: Creator Promotes Joiner to EDITOR

**Steps:**
1. Window A (creator): Open Users panel
2. Find Window B user → Change role to EDITOR
3. Window B should receive role update
4. Try to draw in Window B

**Expected Result:** ✅ Window B can now draw, strokes sync to Window A

### Test 4: Permission Denial Logging

**Steps:**
1. Window B: Join as VIEWER
2. Open browser dev tools (Network tab)
3. Try to draw
4. Check backend logs

**Expected Result:** ✅ Backend logs show:
```
[PERMISSION DENIED] User ... (role: viewer) attempted to draw in ...
```

---

## Role Constants

Defined in `roles.js`:

```javascript
const ROLES = {
  CREATOR: 'creator',    // Full access
  EDITOR: 'editor',      // Draw and edit
  VIEWER: 'viewer'       // Read-only
};
```

**Always use these constants** instead of magic strings:

```javascript
// ✅ Good
if (userRole === ROLES.CREATOR) { ... }

// ❌ Avoid
if (userRole === 'creator') { ... }  // Magic string
```

---

## Future Enhancements

Potential role system improvements:

1. **Granular Permissions** - Allow admins to customize permissions per role
2. **Session-Specific Roles** - Different role levels for different sessions
3. **Time-Limited Roles** - Temporary EDITOR access that expires
4. **Audit Trail** - Log all role changes and permission denials
5. **Role-Based Notifications** - Alert users when their role changes
6. **Import/Export Permissions** - Fine-grained control over export access

---

## Troubleshooting

### Creator Cannot Draw

**Symptoms:** Session creator has CREATOR role but drawing tools disabled

**Possible Causes:**
1. Frontend not receiving 'user-joined' event
2. Frontend role comparison using wrong constant
3. Socket connection interrupted

**Solution:**
1. Check browser console for errors
2. Check backend logs for 'user-joined' emit
3. Verify `useSessionState.js` is handling role updates correctly

### User Joined as VIEWER Can Still Draw

**Symptoms:** VIEWER role users can draw strokes/shapes

**Possible Causes:**
1. Permission check missing in socket handler
2. Using wrong permission constant
3. Frontend UI not respecting permissions

**Solution:**
1. Verify socket handler has `canPerformAction()` check
2. Check roles.js for correct permission matrix
3. Frontend should disable UI elements for VIEWER role

### Role Changes Don't Propagate

**Symptoms:** Role changed on one window, not reflected in another

**Possible Causes:**
1. 'role-updated' event not broadcasted
2. Frontend not listening to 'role-updated'
3. Socket room issue

**Solution:**
1. Verify emit in 'role-change' handler
2. Check socket subscription to 'role-updated'
3. Verify users in same session room

---

## References

- **Backend:** `collab-backend/roles.js`
- **Backend:** `collab-backend/server.js` (socket handlers)
- **Frontend:** `collab-frontend/src/hooks/useSessionState.js` (state management)
- **Tests:** `collab-backend/TEST_REPORT_COLLAB_DASHBOARD_FIXED_ROLE_BUG.md`
- **Commit:** `fix: add role constants and fix session creator role assignment` (e2c2593)
