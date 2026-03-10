# Socket.io API Reference - Sprints 10-18 (Advanced Features)

## Overview
Complete Socket.io event reference for collaborative dashboard v2 with persistence, undo/redo, camera sync, presence awareness, comments, roles, activity logging, and shape recognition.

---

## Session Management Events

### session-create
**Direction:** Client → Server

**Arguments:** None

**Response:**
```javascript
{
  sessionId: "sess_abc12345",
  session: {
    id: "sess_abc12345",
    name: "Session abc12",
    creator: "socket_id",
    users: ["socket_id_1", "socket_id_2"],
    sessionMembers: { "socket_id_1": { role: "admin" } },
    cursors: {},
    strokes: [],
    shapes: [],
    textBoxes: [],
    comments: [],
    history: [],
    historyIndex: -1,
    camera: { x: 0, y: 0, zoom: 1, timestamp },
    userPresence: {},
    activityLog: []
  }
}
```

---

### session-join
**Direction:** Client → Server

**Arguments:**
```javascript
{
  sessionId: "sess_abc12345"
}
```

**Response:**
```javascript
{
  sessionId: "sess_abc12345",
  session: { /* full session state as above */ }
}
```

**Server Broadcast:** `user-joined` to all users in session

---

## Sprint 10-11: Undo/Redo Events

### undo
**Direction:** Client → Server

**Arguments:** None

**Response:**
```javascript
{
  success: true,
  operationIndex: 3,
  history: [/* full operation history */]
}
```

**Server Broadcast:** `undo-applied`
```javascript
{
  operationIndex: 3,
  appliedBy: "socket_id"
}
```

---

### redo
**Direction:** Client → Server

**Arguments:** None

**Response:**
```javascript
{
  success: true,
  operationIndex: 4,
  history: [/* full operation history */]
}
```

**Server Broadcast:** `redo-applied`
```javascript
{
  operationIndex: 4,
  appliedBy: "socket_id"
}
```

---

### undo-applied
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
{
  operationIndex: 3,
  appliedBy: "socket_id_xyz"
}
```

---

### redo-applied
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
{
  operationIndex: 4,
  appliedBy: "socket_id_xyz"
}
```

---

## Sprint 13-14: Camera Sync Events

### camera-change
**Direction:** Client → Server

**Arguments:**
```javascript
{
  x: -50,        // Pan X position (world coords)
  y: -100,       // Pan Y position (world coords)
  zoom: 1.5,     // Zoom level (0.5 - 3.0)
  timestamp: 1234567890
}
```

**Server Broadcast:** `camera-updated` to all users in session (not sender)

---

### camera-updated
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
{
  x: -50,
  y: -100,
  zoom: 1.5,
  timestamp: 1234567890
}
```

---

## Drawing Events (Enhanced)

### stroke-draw
**Direction:** Client → Server

**Arguments:**
```javascript
{
  points: [
    { x: 10, y: 20 },
    { x: 15, y: 25 },
    { x: 20, y: 30 }
  ],
  color: "#000000",
  width: 2
}
```

**Server Broadcast:** `stroke-created`
```javascript
{
  id: 1234567890.123,
  userId: "socket_id",
  points: [/* as sent */],
  color: "#000000",
  width: 2,
  timestamp: 1234567890,
  comments: []
}
```

**Note:** Adds to history: `{ action: 'stroke-added', payload: { strokeId, stroke }, userId }`

---

### shape-draw
**Direction:** Client → Server

**Arguments:**
```javascript
{
  type: "rectangle",  // "line" | "rectangle" | "circle"
  points: [
    { x: 10, y: 20 },
    { x: 50, y: 60 }
  ],
  color: "#000000",
  width: 2
}
```

**Server Broadcast:** `shape-created`
```javascript
{
  id: 1234567890.456,
  userId: "socket_id",
  type: "rectangle",      // Snapped type if recognized
  points: [/* original */],
  color: "#000000",
  width: 2,
  timestamp: 1234567890,
  bounds: {               // Present if shape recognized
    x: 10,
    y: 20,
    width: 40,
    height: 40
  },
  comments: []
}
```

**Note:** 
- Shape recognition applied automatically
- Adds to history: `{ action: 'shape-added', ... }`

---

### shape-created
**Direction:** Server → Client (Broadcast)

**Payload:** As above with `shape-draw`

---

## Text Events (Enhanced)

### text-add
**Direction:** Client → Server

**Arguments:**
```javascript
{
  text: "Important note",
  x: 100,
  y: 200,
  color: "#000000"
}
```

**Server Broadcast:** `text-created`
```javascript
{
  id: 1234567890.789,
  userId: "socket_id",
  text: "Important note",
  x: 100,
  y: 200,
  color: "#000000",
  timestamp: 1234567890,
  version: 0,
  comments: []
}
```

---

### text-update
**Direction:** Client → Server

**Arguments:**
```javascript
{
  id: 1234567890.789,
  text: "Updated note"
}
```

**Validation:** Only text owner can update (userId matches)

**Server Broadcast:** `text-updated`
```javascript
{
  id: 1234567890.789,
  userId: "socket_id",
  text: "Updated note",
  x: 100,
  y: 200,
  color: "#000000",
  timestamp: 1234567890,    // Updated server time
  version: 1,
  serverTime: 1234567891,
  editorId: "socket_id",
  comments: []
}
```

**Note:** Last-Write-Wins conflict resolution with serverTime

---

### text-delete
**Direction:** Client → Server

**Arguments:**
```
textBoxId (string or number)
```

**Validation:** Only text owner can delete

**Server Broadcast:** `text-deleted`
```javascript
textBoxId
```

---

## Sprint 16: Presence Awareness Events

### cursor-update
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
{
  userId: "socket_id",
  x: 250,
  y: 150,
  timestamp: 1234567890
}
```

**Also Updates (Internal):**
```javascript
// In userPresence[userId]:
{
  cursor: { x: 250, y: 150 },
  isDrawing: false,
  lastActivity: 1234567890,
  activeArea: null
}
```

---

## Sprint 17: Comments/Threads Events

### comment-add
**Direction:** Client → Server

**Arguments:**
```javascript
{
  strokeId: 1234567890.123,  // Element ID (stroke/shape)
  text: "Good observation!"
}
```

**Validation:** Text max 200 chars

**Server Broadcast:** `comment-created`
```javascript
{
  id: 1234567891.456,
  strokeId: 1234567890.123,
  text: "Good observation!",
  author: "socket_id",
  timestamp: 1234567891,
  resolved: false
}
```

---

### comment-resolve
**Direction:** Client → Server

**Arguments:**
```javascript
commentId
```

**Validation:** Only comment author can resolve

**Server Broadcast:** `comment-resolved`
```javascript
commentId
```

---

### comment-created
**Direction:** Server → Client (Broadcast)

**Payload:** As above with `comment-add`

---

### comment-resolved
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
commentId
```

---

## Sprint 18: Roles & Permissions Events

### role-change
**Direction:** Client → Server (Admin only)

**Arguments:**
```javascript
{
  userId: "socket_id_to_change",
  newRole: "viewer"  // "admin" | "editor" | "viewer"
}
```

**Validation:** Sender must be admin role

**Server Broadcast:** `role-updated`
```javascript
{
  userId: "socket_id_to_change",
  newRole: "viewer"
}
```

---

### role-updated
**Direction:** Server → Client (Broadcast)

**Payload:**
```javascript
{
  userId: "socket_id",
  newRole: "viewer"
}
```

---

## User Join/Leave Events

### user-joined
**Direction:** Server → Client (Broadcast to all in session)

**Payload:**
```javascript
{
  userId: "socket_id_new",
  users: ["socket_id_1", "socket_id_2", "socket_id_new"],
  sessionState: { /* full session object */ }
}
```

---

### user-left
**Direction:** Server → Client (Broadcast to remaining users)

**Payload:**
```javascript
{
  userId: "socket_id_left",
  users: ["socket_id_1"],
  cursors: {},
  userPresence: {}
}
```

---

## Latency Measurement Events

### latency-ping
**Direction:** Client → Server

**Arguments:**
```javascript
{
  clientTime: 1234567890123
}
```

---

### latency-pong
**Direction:** Server → Client

**Payload:**
```javascript
{
  clientTime: 1234567890123,
  serverTime: 1234567890234
}
```

**Calculation:** RTT = serverTime - clientTime

---

## Error Handling

### Validation Errors
**Scenarios:**
- Invalid session ID
- Non-existent element
- Text too long (>500 chars)
- Invalid color format
- Unauthorized action (viewer trying to draw)

**Response:**
```javascript
callback({ error: "Session not found" })
```

---

### Permissions Errors
**Rejected Scenarios:**
- Viewer trying to draw
- Non-owner trying to edit text
- Non-admin trying to change roles
- Non-author trying to resolve comment

**Response:** Server silently ignores (no error emission)

---

## Data Structures

### Session State
```javascript
{
  id: "sess_xyz",
  name: "My Session",
  creator: "socket_id_1",
  createdAt: 1234567890,
  updatedAt: 1234567890,
  
  // Real-time
  users: ["socket_id_1", "socket_id_2"],
  sessionMembers: {
    "socket_id_1": { role: "admin" },
    "socket_id_2": { role: "editor" }
  },
  cursors: {
    "socket_id_1": { x: 100, y: 200, timestamp }
  },
  strokes: [/* stroke objects */],
  shapes: [/* shape objects */],
  textBoxes: [/* text objects */],
  comments: [/* comment objects */],
  
  // Sprint 10-11: History
  history: [
    {
      action: "stroke-added",
      payload: { strokeId, stroke },
      userId: "socket_id",
      timestamp: 1234567890
    }
  ],
  historyIndex: 2,
  
  // Sprint 13-14: Camera
  camera: {
    x: 0,
    y: 0,
    zoom: 1,
    timestamp: 1234567890
  },
  
  // Sprint 16: Presence
  userPresence: {
    "socket_id_1": {
      cursor: { x: 100, y: 200 },
      isDrawing: true,
      lastActivity: 1234567890,
      activeArea: {
        x: 50,
        y: 60,
        x2: 150,
        y2: 260
      }
    }
  },
  
  // Sprint 18: Activity
  activityLog: [
    {
      action: "user-joined",
      userId: "socket_id",
      timestamp: 1234567890,
      details: { userName: "socket_id_1" }
    }
  ]
}
```

### Stroke Object
```javascript
{
  id: 1234567890.123,
  userId: "socket_id",
  points: [{ x, y }, ...],
  color: "#000000",
  width: 2,
  timestamp: 1234567890,
  comments: [/* comment IDs */]
}
```

### Shape Object
```javascript
{
  id: 1234567890.456,
  userId: "socket_id",
  type: "rectangle",          // Possibly snapped
  points: [{ x, y }, ...],    // Original points
  color: "#000000",
  width: 2,
  timestamp: 1234567890,
  bounds: {                   // Present if snapped
    x: 10,
    y: 20,
    width: 40,
    height: 40
    // OR for circle:
    // center: { x, y },
    // radius: 20
  },
  comments: [/* comment IDs */]
}
```

### Comment Object
```javascript
{
  id: 1234567891.456,
  strokeId: 1234567890.123,   // Parent element
  text: "Good work!",
  author: "socket_id",
  timestamp: 1234567891,
  resolved: false
}
```

### Activity Log Entry
```javascript
{
  action: "stroke-added",     // Action type
  userId: "socket_id",
  timestamp: 1234567890,
  details: {                  // Custom per action
    strokeCount: 5,
    shapeType: "rectangle"
  }
}
```

---

## Performance Characteristics

| Operation | Latency | Broadcast Scope | Frequency |
|-----------|---------|-----------------|-----------|
| cursor-move | <100ms | Session (excl. self) | Every 50ms max |
| undo | <200ms | Session | On demand |
| redo | <200ms | Session | On demand |
| camera-change | <300ms | Session (excl. self) | On demand |
| stroke-draw | <200ms | Session | On demand |
| comment-add | <200ms | Session | On demand |
| role-change | <200ms | Session | On demand |

---

## Rate Limiting & Backpressure

### Cursor Events
- Debounced: Max 20 emits/sec (every 50ms)
- Server relays without buffering
- Clients should interpolate locally

### Draw Events
- No rate limiting
- Batched by client (one emit per complete stroke)
- Server appends directly

### Undo/Redo
- No rate limiting
- Instant feedback to client
- All users converge to same state

### Comments
- No rate limiting
- Instant broadcast
- Max 200 chars per comment

---

## Migration Notes (Sprints 1-9 → 10-18)

### Breaking Changes
- None. All new features are additive.
- Existing socket events unchanged.

### New Default Values
- `role`: "editor" (for new session members)
- `history`: [] (empty by default)
- `camera`: { x: 0, y: 0, zoom: 1 }
- `userPresence`: {} (populated on join)

### Backward Compatibility
- Clients without new features still work
- Missing history/camera/presence fields ignored
- Server supports old and new clients simultaneously

---

## Testing Scenarios

### Undo/Redo
1. Draw 5 strokes
2. Undo 3 times → verify state correct
3. Redo 2 times → verify state correct
4. Draw new stroke → verify history resets

### Camera Sync
1. Client A pans to (100, 200)
2. All clients see camera at (100, 200)
3. Client B zooms to 1.5x
4. All clients see zoom 1.5x

### Comments
1. Client A comments on stroke
2. All clients see comment in real-time
3. Only author can resolve
4. Unresolved badge updates

### Roles
1. Creator is admin
2. Admin promotes user to editor
3. Editor cannot change roles
4. Viewer cannot draw (strokes ignored)

---

## Conclusion

All Socket.io events documented with full payload examples, latency targets, and validation rules. Server-side validation enforced for permissions and data integrity.

**API Version:** 2.0 (Sprints 10-18)  
**Last Updated:** 2026-03-10
