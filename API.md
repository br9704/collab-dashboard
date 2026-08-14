# Socket.io API Reference

> **Accuracy note (2026-08-14).** This reference is *partial and in one place wrong*, and is
> superseded in Sprint 3 by a formally declared contract — see [`masterplan.md`](masterplan.md).
> Measured against `collab-backend/server.js`, which has **16** handlers:
>
> - **Documented but not implemented:** `tool-change` / `tool-changed`. The client emits it;
>   no server handler exists. Marked inline below.
> - **Implemented but undocumented here:** `camera-change`/`camera-updated`, `undo`/`undo-applied`,
>   `redo`/`redo-applied`, `comment-add`/`comment-created`, `comment-resolve`/`comment-resolved`,
>   `role-change`/`role-updated`, `disconnect`.
> - A further **12** client events beyond `tool-change` have no handler at all
>   (`template-load`, `smart-shape-place`, `shape-recognition-accept`, `video-embed*`,
>   `layer-*`, `text-formatting-update`, `permission-change`).

## Client → Server Events

### `session-create`
Create a new collaborative session.

**Payload:** (empty)

**Response:** `{ sessionId: "sess_..." }`

**Purpose:** Initiates a new session that other users can join.

---

### `session-join`
Join an existing session.

**Payload:** `sessionId` (string)

**Response:** 
```javascript
{
  sessionId: "sess_...",
  error?: "Session not found",
  session: {
    id, users, cursors, strokes, shapes, textBoxes, mode
  }
}
```

**Purpose:** Connect to an existing session and receive full state snapshot.

---

### `cursor-move`
Update cursor position (debounced max every 50ms).

**Payload:**
```javascript
{ x: number, y: number }
```

**Broadcasting:** Sent to all users in session except sender.

**Latency target:** <100ms

---

### `stroke-draw`
Draw a freehand stroke (pencil tool).

**Payload:**
```javascript
{
  points: [{ x, y }, { x, y }, ...],  // Array of points
  color: "#RRGGBB",                   // Hex color
  width: number                       // Line width in pixels
}
```

**Broadcasting:** `stroke-created` emitted to all users.

**Latency target:** <200ms

---

### `shape-draw`
Draw a geometric shape (line, rectangle, circle).

**Payload:**
```javascript
{
  type: "line" | "rectangle" | "circle",
  points: [{ x, y }, { x, y }],  // Start and end points
  color: "#RRGGBB",
  width: number
}
```

**Broadcasting:** `shape-created` emitted to all users.

**Latency target:** <200ms

---

### `text-add`
Add a text annotation to the canvas.

**Payload:**
```javascript
{
  text: string,          // 1-500 chars
  x: number,             // Canvas X coordinate
  y: number,             // Canvas Y coordinate
  color: "#RRGGBB"       // Text color
}
```

**Broadcasting:** `text-created` emitted to all users.

**Latency target:** <200ms

---

### `text-update`
Edit an existing text annotation (Conflict Resolution: Last-Write-Wins).

**Payload:**
```javascript
{
  id: string,            // Text box ID
  text: string           // New text
}
```

**Validation:** Only the original author can edit.

**Broadcasting:** `text-updated` emitted to all users.

**Conflict Resolution:** If multiple users edit the same text simultaneously:
- Server timestamps both edits
- Broadcasts the last edit (highest timestamp) to all users
- All users converge to same state within <300ms

---

### `text-delete`
Delete a text annotation.

**Payload:** `annotationId` (string)

**Validation:** Only the original author can delete.

**Broadcasting:** `text-deleted` emitted to all users.

**Idempotency:** Deleting non-existent annotation returns success (safe).

---

### `tool-change` — ⚠️ NOT IMPLEMENTED
Change the active drawing tool/mode.

**Status:** the client emits this event; **there is no server handler**, so nothing is ever
broadcast and no other user sees the change. Implemented in Sprint 3.

**Payload:**
```javascript
{
  mode: "pencil" | "line" | "rectangle" | "circle" | "text"
}
```

**Broadcasting:** `tool-changed` emitted to all users.

---

### `latency-ping`
Measure round-trip latency (for diagnostics).

**Payload:** `{ clientTime: Date.now() }`

**Response:** `latency-pong` with server timestamp echoed back.

**Usage:** Client measures latency = now() - clientTime

---

## Server → Client Events

### `user-joined`
Emitted when a new user joins the session.

**Payload:**
```javascript
{
  userId: string,
  users: [ids...],
  sessionState: {
    id, cursors, strokes, shapes, textBoxes, mode
  }
}
```

**Broadcast:** All users in session receive this (new user gets full state).

---

### `user-left`
Emitted when a user disconnects from the session.

**Payload:**
```javascript
{
  userId: string,
  users: [remaining ids...],
  cursors: { updated cursors without left user }
}
```

**Broadcast:** All remaining users in session.

---

### `cursor-update`
Emitted when another user's cursor moves.

**Payload:**
```javascript
{
  userId: string,
  x: number,
  y: number,
  timestamp: number
}
```

**Frequency:** Max every 50ms (debounced).

**Rendering:** Client should interpolate smoothly over 50ms (easing function).

---

### `stroke-created`
Emitted when a stroke is drawn.

**Payload:**
```javascript
{
  id: string,
  userId: string,
  points: [{ x, y }, ...],
  color: "#RRGGBB",
  width: number,
  timestamp: number
}
```

---

### `shape-created`
Emitted when a shape is drawn.

**Payload:**
```javascript
{
  id: string,
  userId: string,
  type: "line" | "rectangle" | "circle",
  points: [{ x, y }, { x, y }],
  color: "#RRGGBB",
  width: number,
  timestamp: number
}
```

---

### `text-created`
Emitted when text is added.

**Payload:**
```javascript
{
  id: string,
  userId: string,
  text: string,
  x: number,
  y: number,
  color: "#RRGGBB",
  timestamp: number
}
```

---

### `text-updated`
Emitted when text is edited (Conflict Resolution: Last-Write-Wins).

**Payload:**
```javascript
{
  id: string,
  userId: string,
  text: string,
  version: number,              // Edit counter
  timestamp: number,            // Client timestamp
  serverTime: number,           // Server timestamp (for conflict resolution)
  editorId: string              // Who made the edit
}
```

**Consistency Guarantee:** All users see the latest version (last-write-wins).

---

### `text-deleted`
Emitted when text is deleted.

**Payload:**
```javascript
{
  id: string
}
```

---

### `tool-changed`
Emitted when the drawing tool changes.

**Payload:**
```javascript
{
  mode: string,
  userId: string
}
```

---

### `latency-pong`
Response to latency-ping (for diagnostics).

**Payload:**
```javascript
{
  clientTime: number  // Echoed from client
}
```

---

## Error Handling

All events include error handling:

- **Invalid data:** Silently rejected (logged server-side)
- **Session not found:** Callback returns `{ error: "Session not found" }`
- **Authorization failed:** Text delete returns error if user ≠ author
- **Network error:** Socket.io auto-reconnects with backoff

---

## Performance Characteristics

| Operation | Latency Target | Broadcast | Debounce |
|-----------|----------------|-----------|----------|
| Cursor move | <100ms | All except sender | 50ms |
| Stroke/Shape draw | <200ms | All users | None |
| Text add | <200ms | All users | None |
| Text update | <300ms | All users | None |
| Text delete | <200ms | All users | None |

---

## Example Usage

### Create & Join Session
```javascript
// User 1: Create session
socket.emit('session-create', (response) => {
  const sessionId = response.sessionId;
  // Share sessionId with others...
});

// User 2: Join session
socket.emit('session-join', sessionId, (response) => {
  if (response.error) {
    console.error(response.error);
  } else {
    // Now in session, receive full state
    const { cursors, strokes, shapes, textBoxes } = response.session;
  }
});
```

### Draw Stroke
```javascript
const points = [{ x: 10, y: 20 }, { x: 30, y: 40 }, ...];
socket.emit('stroke-draw', {
  points,
  color: '#ff0000',
  width: 2
});

socket.on('stroke-created', (stroke) => {
  console.log('Stroke drawn by', stroke.userId);
  // Render stroke on canvas
});
```

### Edit Text (Conflict Resolution)
```javascript
// User A and B both edit same text simultaneously
socket.emit('text-update', { id: 'text_123', text: 'User A version' });
socket.emit('text-update', { id: 'text_123', text: 'User B version' });

// Server timestamps both edits (A=100ms, B=105ms)
// Broadcasts B's version (later timestamp) to all users
// All users see same final state within 300ms
socket.on('text-updated', (textBox) => {
  // Both users converge to: 'User B version'
});
```

---

Built by Claude Code for Bruno Jaamaa
