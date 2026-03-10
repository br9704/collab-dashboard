# TROUBLESHOOTING.md - Role Assignment Bug & Permission Issues

## Critical Issue: Session Creator Shows as VIEWER

### Issue Description

When a user creates a new collaborative session, the UI displays "VIEWER" role instead of "CREATOR", and all drawing tools are disabled. The session creator cannot draw or edit despite having full permissions.

### Root Cause

The `session-create` socket handler was missing the critical `io.to(sessionId).emit('user-joined', ...)` event that broadcasts the creator's role to connected clients.

**Code Issue (FIXED in Commit e2c2593):**

```javascript
// BEFORE (BUGGY)
socket.on('session-create', (callback) => {
  const session = createSession();
  session.creator = userId;
  session.addUser(userId, 'admin');  // Correctly assigned admin role
  userRole = 'admin';  // Local state correct
  currentSessionId = session.id;
  socket.join(session.id);

  // ❌ BUG: No emit statement!
  // Frontend never learns the creator's role

  callback({ sessionId: session.id, session: session.toJSON() });
});

// AFTER (FIXED)
socket.on('session-create', (callback) => {
  const session = createSession();
  session.creator = userId;
  session.addUser(userId, ROLES.CREATOR);  // Assign CREATOR role
  userRole = ROLES.CREATOR;
  currentSessionId = session.id;
  socket.join(session.id);

  // ✅ FIX: Emit user-joined so frontend receives role
  io.to(session.id).emit('user-joined', {
    userId,
    role: ROLES.CREATOR,  // Frontend now knows creator's role!
    users: Array.from(session.users),
    sessionState: session.toJSON()
  });

  callback({ sessionId: session.id, session: session.toJSON() });
});
```

### Symptom Checklist

- [ ] Session creator UI shows "VIEWER" role
- [ ] Drawing tools disabled for creator
- [ ] Creator cannot draw strokes or shapes
- [ ] Text input disabled for creator
- [ ] Undo/Redo buttons disabled for creator
- [ ] Other joining users can see creator's role as VIEWER
- [ ] Backend logs show `[SESSION-CREATE]` but no `user-joined` emit

---

## Verification Steps

### Step 1: Check Backend Logs

Run backend and create a session. Look for these log messages:

```bash
[SESSION-CREATE] User ... created ... with role: creator
```

**Expected:** Log shows `role: creator`  
**Buggy:** Log shows `role: admin` or no role info

### Step 2: Network Inspection (Browser DevTools)

1. Open browser → Developer Tools → Network/Console tab
2. Create new session
3. Filter for WebSocket messages
4. Look for `user-joined` event

**Expected:**
```json
{
  "type": "user-joined",
  "data": {
    "userId": "...",
    "role": "creator",
    "users": [...],
    "sessionState": {...}
  }
}
```

**Buggy:** No `user-joined` event or role field missing

### Step 3: Frontend State Check

Open browser console and run:

```javascript
// Check Redux/Context state
console.log(store.getState().session.userRole);  // Should be 'creator'
console.log(store.getState().session.sessionMembers);  // Check role
```

**Expected:** `userRole === 'creator'`  
**Buggy:** `userRole === 'viewer'` or undefined

### Step 4: Two-Window Verification

1. Open Session A in Window 1 (create session)
2. Open Session A in Window 2 (join session)
3. Compare role display in both windows

**Expected:**
- Window 1: Shows "CREATOR" role, drawing enabled
- Window 2: Shows "VIEWER" role, drawing disabled

**Buggy:**
- Window 1: Shows "VIEWER" role, drawing disabled
- Window 2: Shows "VIEWER" role, drawing disabled

---

## Common Issues & Solutions

### Issue 1: Creator Shows VIEWER, Cannot Draw

**Symptoms:**
- Session creator role displays as "VIEWER"
- Draw button is disabled
- Text tools are disabled
- Drawing fails silently

**Root Cause:**
- Missing `user-joined` emit in `session-create`
- Role not broadcasted to frontend
- Frontend defaults to VIEWER

**Fix:**
```bash
cd collab-backend
git pull  # Get latest commit e2c2593
npm run dev  # Restart backend
```

**Verify Fix:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh page
3. Create new session
4. Check role label (should be CREATOR)
5. Try drawing (should work)

---

### Issue 2: Joiner Can Draw When Role is VIEWER

**Symptoms:**
- User joins session as VIEWER
- Drawing tools are enabled
- User can create strokes/shapes
- Permission checks not enforced

**Root Cause:**
- Socket handler missing permission check
- `canPerformAction()` not called
- Using `userRole === 'viewer'` instead of constant

**Frontend Check:**
Look for disable condition in UI:
```jsx
// ❌ Wrong (doesn't work reliably)
disabled={userRole === 'viewer'}

// ✅ Correct
disabled={!canPerformAction(userRole, 'draw-stroke')}
```

**Backend Check:**
Verify socket handlers have permission checks:
```javascript
socket.on('stroke-draw', (data) => {
  // ✅ Should have this check
  if (!canPerformAction(userRole, 'draw-stroke')) {
    console.warn('Permission denied');
    return;
  }
  
  // Process stroke...
});
```

**Fix:**
1. Verify all drawing handlers have permission checks
2. Use `canPerformAction()` function
3. Use role constants from `roles.js`

---

### Issue 3: Role Change Not Syncing

**Symptoms:**
- Creator changes user's role
- Role changed in one window but not other
- User still can't draw after being promoted to EDITOR

**Root Cause:**
- `role-updated` event not broadcasted
- Frontend not listening to `role-updated`
- Socket room issue

**Backend Fix:**
Verify `role-change` handler emits:
```javascript
socket.on('role-change', (data) => {
  // ...
  io.to(currentSessionId).emit('role-updated', {  // ✅ Should emit
    userId: data.userId,
    newRole: data.newRole,
    changedBy: userId
  });
});
```

**Frontend Fix:**
Verify listening to `role-updated`:
```javascript
socket.on('role-updated', (data) => {  // ✅ Should listen
  setSessionMembers(prev => ({
    ...prev,
    [data.userId]: { role: data.newRole }
  }));
});
```

---

### Issue 4: Undo/Redo Buttons Don't Work

**Symptoms:**
- Undo/Redo buttons disabled for creator
- Buttons grayed out even after drawing
- Keyboard shortcuts (Ctrl+Z) don't work

**Root Cause:**
- Permission check preventing undo/redo
- Frontend UI not respecting role
- History not being tracked

**Solution:**

1. **Check Backend Permission:**
```javascript
// Undo handler should have permission check
socket.on('undo', (callback) => {
  if (!canPerformAction(userRole, 'undo')) {
    // This would block VIEWER but allow CREATOR/EDITOR
    callback({ success: false });
    return;
  }
  // Process undo...
});
```

2. **Check Frontend Conditions:**
```jsx
// Should not disable for CREATOR
<button disabled={userRole === ROLES.VIEWER}>Undo</button>
```

3. **Check History State:**
```javascript
// Verify history exists and has items
const hasHistory = session.history.length > 0 && session.historyIndex >= 0;
```

---

## Diagnostic Commands

### Check Backend State

```bash
# View recent logs
tail -f server.log | grep "SESSION-CREATE\|user-joined"

# Check git commit
git log --oneline | head -5
# Should show: "fix: add role constants and fix session creator role assignment"

# Verify roles.js exists
ls -la collab-backend/roles.js
```

### Test Socket Events

In browser console:
```javascript
// Listen for all socket events
socket.onAny((event, ...args) => {
  console.log(`[SOCKET] ${event}`, args);
});

// Create session and watch logs
socket.emit('session-create', (data) => {
  console.log('Session created:', data);
});
```

### Check Permission Matrix

```javascript
// In browser console after joining session
const { canPerformAction } = await import('./roles.js');

console.log('Can draw (CREATOR)?', canPerformAction('creator', 'draw-stroke'));    // true
console.log('Can draw (VIEWER)?', canPerformAction('viewer', 'draw-stroke'));      // false
console.log('Can edit (EDITOR)?', canPerformAction('editor', 'edit-text'));        // true
console.log('Can manage (EDITOR)?', canPerformAction('editor', 'change-user-role')); // false
```

---

## Regression Testing

After applying fix, verify these scenarios:

### Test 1: Basic Creation
- [ ] Create session → Creator shows CREATOR role
- [ ] Creator can draw → Stroke appears in real-time
- [ ] Creator can add text → Text box appears

### Test 2: User Joining
- [ ] Join session → Joiner shows VIEWER role
- [ ] Joiner cannot draw → Drawing disabled
- [ ] Joiner cannot edit text → Editing disabled
- [ ] Creator can see joiner joined → User list updated

### Test 3: Role Promotion
- [ ] Creator promotes joiner to EDITOR
- [ ] Joiner can now draw → Strokes work
- [ ] Strokes sync to creator → Both windows show strokes
- [ ] Demote back to VIEWER → Drawing disabled again

### Test 4: Multi-User
- [ ] Create session with 3+ users
- [ ] Assign different roles (CREATOR, EDITOR, VIEWER)
- [ ] Each draws while appropriate role → Only permitted roles can draw
- [ ] Verify sync across all windows

### Test 5: Persistence
- [ ] Create session → Creator draws
- [ ] Close creator window
- [ ] Joiner still sees content → Content persisted
- [ ] Creator rejoins → Sees their drawing

---

## Performance & Monitoring

### Monitor Permission Denials

Check backend logs for permission issues:

```bash
grep "PERMISSION DENIED" server.log | wc -l
# Count of denied attempts

grep "PERMISSION DENIED" server.log | head -10
# See recent attempts
```

### Track Role Changes

```bash
grep "ROLE-CHANGE" server.log
# See all role assignments and changes
```

### Session Creation Success Rate

```bash
grep "SESSION-CREATE" server.log | wc -l
# Count of created sessions

grep "SESSION-CREATE.*creator" server.log | wc -l
# Count of successful creator assignments
```

---

## Rollback Procedure

If issues occur after fix:

```bash
# See previous commits
git log --oneline collab-backend/server.js | head -5

# Revert to previous version if needed
git revert e2c2593  # Revert the fix commit
# OR
git checkout HEAD~1 server.js  # Restore previous version

# Restart backend
npm run dev
```

---

## Getting Help

### Checklist Before Reporting

- [ ] Verified git commit (e2c2593) is applied
- [ ] Restarted backend server
- [ ] Cleared browser cache
- [ ] Tested in incognito/private mode
- [ ] Checked browser console for errors
- [ ] Checked backend logs for warnings
- [ ] Tried in different browser

### Information to Provide

When reporting issues:

1. **Reproduction Steps:**
   ```
   1. Create session
   2. [What you did]
   3. [What happened]
   ```

2. **Expected vs Actual:**
   ```
   Expected: [behavior]
   Actual: [behavior]
   ```

3. **Environment:**
   - Browser: Chrome/Firefox/Safari/Edge
   - Backend version: `git log --oneline -1`
   - Frontend version: Check `package.json`

4. **Logs:**
   - Backend console output
   - Browser console errors
   - Network tab WebSocket messages

---

## Prevention

### Code Review Checklist

For future socket handlers:

- [ ] All permission checks use `canPerformAction()`
- [ ] Role constants from `ROLES` object used
- [ ] Important events have `io.to(roomId).emit()`
- [ ] Handlers have JSDoc comments
- [ ] Permission denied cases logged with `console.warn()`
- [ ] Tests verify both allowed and denied cases

### Testing Checklist

For each feature:

- [ ] Creator can perform action
- [ ] EDITOR can perform action (if applicable)
- [ ] VIEWER cannot perform action
- [ ] Permission denial is logged
- [ ] Event syncs across windows
- [ ] Role changes reflected immediately

---

## Version History

| Date | Version | Status | Notes |
|------|---------|--------|-------|
| 2026-03-10 | e2c2593 | FIXED | Added role constants and fixed session-create emit |
| 2026-03-10 | - | BUGGY | Creator showed as VIEWER, all tools disabled |

---

**Last Updated:** 2026-03-10  
**Related Files:**
- `collab-backend/roles.js` - Role definitions
- `collab-backend/server.js` - Socket handlers
- `collab-backend/ROLES.md` - Role system documentation
