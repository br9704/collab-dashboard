# API Reference

**Authoritative as of Sprint 3 (2026-08-14); event contract re-checked and the Environment
section corrected 2026-08-15.** Every event below is implemented and verified end to end;
there are no documented-but-missing events and no emitted-but-unhandled ones.
That was not true before — this file previously described `tool-change` as working when no
handler existed, and omitted seven events that did.

The backend speaks **two protocols on one port**, because a WebSocket backend needs a
long-lived process and free-tier hosting gives you exactly one.

| Surface | Path | Carries | Durability |
|---|---|---|---|
| Yjs document | `ws://<host>/collaboration` | strokes, shapes, text, comments, layers, video embeds | **persisted** to SQLite |
| Awareness (same socket) | — | cursors, camera, is-drawing | ephemeral by design |
| socket.io | `/socket.io` | session lifecycle, roles, tool selection, activity | membership persisted; feed ephemeral |
| HTTP | `/health`, `/` | health and discovery | — |

---

## The permission model

Three roles, defined in `collab-backend/roles.js`:

| | draw / edit | comment | change roles | manage permissions |
|---|---|---|---|---|
| `creator` | ✅ | ✅ | ✅ | ✅ |
| `editor` | ✅ | ✅ | ❌ | ❌ |
| `viewer` | ❌ | ✅ | ❌ | ❌ |

**The boundary is the document connection, not the UI.** A CRDT hands every connected client
a writable handle on the shared type, so hiding the toolbar from viewers is decoration. On
every document connection `onAuthenticate` looks the member's role up in SQLite and marks
viewer connections **read-only**, which makes Hocuspocus reject their updates server-side.
Verified by driving the wire protocol with a valid viewer token and no UI involved.

A role change re-evaluates that flag only on a **new** connection — the flag is fixed for a
connection's lifetime. `role-updated` therefore carries `requiresDocReconnect: true`, and the
affected client reopens its document.

### Identity

Members are keyed by a **stable client id**, not by `socket.id`. Socket ids are minted fresh
on every connection, so keying membership by one would mean a reload makes you a stranger —
and the creator of a board would return to their own board as a viewer with no way back in.
The client id lives in `localStorage` and identifies a *browser*, not a person; it is not an
authentication credential.

### Document tokens

`collabToken` is `"<sessionId>:<clientId>"`, returned by `session-create` / `session-join`.
It is verified on every document connection, and refused when:

- it is malformed
- the session does not exist
- the client is not a member of that session
- **the session half does not match the requested document** (a valid token for board A
  cannot open board B)

---

## Yjs document

One `Y.Doc` per board. Document name = session id.

```
elements   : Y.Map    elementId -> stroke | shape | text | video
comments   : Y.Map    commentId -> comment
layers     : Y.Map    layerId   -> layer
layerOrder : Y.Array  layer ids, in z-order
```

### Element shapes

```js
// stroke — ONE operation per stroke, never one per point
{ kind: 'stroke', userId, points: [{x,y}...], color, width, seq, timestamp, layerId }

// shape — freehand-drawn or recognised
{ kind: 'shape', userId, type: 'line'|'rectangle'|'circle', points, bounds,
  color, width, recognized, seq, timestamp, layerId }

// shape — smart / template variant, a positioned labelled box
{ kind: 'shape', smart: true, type, x, y, width, height, label,
  connectorStyle, color, lineWidth, seq, layerId }

// text — a Y.Map, so the body merges character by character
{ kind: 'text', userId, x, y, color, seq, layerId,
  body: Y.Text, formatting: { bold, italic, underline, strikethrough, fontSize, color } }

// video
{ kind: 'video', type: 'youtube'|'vimeo'|'file', url|data, x, y, width, height, seq, layerId }
```

### Modelling rules

1. **A stroke is inserted once, as an immutable point array.** One CRDT operation per sampled
   point produces thousands of operations per minute of drawing, and CRDT history cannot be
   compacted away.
2. **Text is the exception and uses `Y.Text`.** Bodies are updated by *diffing*, never
   clear-and-rewrite, so concurrent editors merge instead of clobbering.
3. **Nothing ephemeral goes in the document.** Cursors and camera would otherwise be written
   to disk forever.
4. **Ordering is explicit.** `Y.Map` has no meaningful iteration order, so every element
   carries `seq` and render order is `sort(by seq)`.
5. **The Map key is the id.** Element values must not carry their own `id` field — it would
   shadow the key on read.

### Awareness

Ephemeral, keyed by Yjs client id:

```js
{ user: { userId }, cursor: { x, y, t }, camera: { x, y, zoom }, isDrawing: boolean }
```

Cursor positions are in **canvas space**, not screen space, so a remote cursor stays attached
to board content regardless of how either side has panned or zoomed.

---

## socket.io — client → server

### `session-create`
**Payload** `{ clientId }` · **Ack** `{ sessionId, role, session, collabToken }`

Creates a board and assigns the caller `creator`.

> **The ack is authoritative.** The server broadcasts `session-updated` to the room *before*
> invoking this ack, so a client that waits for the broadcast can never receive it — it has
> not subscribed yet. Seeding state from the ack is what makes the creator a creator; not
> doing so is the bug that made them a viewer with `ONLINE (0)`.

### `session-join`
**Payload** `{ sessionId, clientId }` · **Ack** `{ sessionId, role, session, collabToken }`
or `{ error }`

A **returning member keeps their stored role** — that is the point of persisting membership.
Genuinely new joiners get `viewer` and can be promoted.

### `role-change` — creator only
**Payload** `{ userId, newRole }` · **Broadcasts** `role-updated`

### `permission-change` — creator only
**Payload** `{ userId, permission, granted }` · **Broadcasts** `permissions-snapshot`

Granular overrides layered on top of the role matrix. Control-plane state: the hard boundary
remains the read-only document connection.

### `tool-change`
**Payload** `{ mode }` · **Broadcasts** `tool-changed`

Which tool someone is holding — presence-shaped, so sockets rather than the document.
Rendered as a glyph beside each name in the user list.

### `can-i`
**Payload** `action` · **Ack** `{ allowed, role }`

Ask the authoritative permission matrix instead of reimplementing it client-side.

### `latency-ping`
**Payload** `{ clientTime }` · **Replies** `latency-pong` `{ clientTime, serverTime }`

---

## socket.io — server → client

| Event | Payload | Meaning |
|---|---|---|
| `session-updated` | `{ id, name, creator, createdAt, users, sessionMembers, permissionOverrides, activityLog }` | full control-plane view |
| `activity` | `{ action, userId, timestamp, details }` | one feed entry |
| `role-updated` | `{ userId, oldRole, newRole, changedBy, requiresDocReconnect }` | a member's role changed |
| `permissions-snapshot` | `{ overrides, changedBy }` | granular overrides changed |
| `tool-changed` | `{ userId, mode }` | someone selected a different tool |
| `latency-pong` | `{ clientTime, serverTime }` | round-trip probe |

---

## HTTP

### `GET /health`
```json
{ "status": "ok", "uptime": 42, "sessions": 3,
  "documents": 1, "connections": 2, "persistence": "sqlite" }
```

Required by Fly/Railway/Render health checks. This server previously had **zero** HTTP routes.

### `GET /`
Discovery: names the collaboration path and the health endpoint.

---

## Environment

Backend:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | localhost dev origins | Comma-separated allow-list, enforced on both the HTTP and socket.io surfaces |
| `DATABASE_PATH` | `collab-backend/data/collab.sqlite` | SQLite file (documents + sessions) |

Frontend (build-time, Vite):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SOCKET_URL` | `http://localhost:3001` | Backend origin |
| `VITE_COLLAB_URL` | derived from `VITE_SOCKET_URL` | Yjs document endpoint; `http→ws`, `https→wss` |

All of the above are implemented and were verified in Sprint 6 by running the whole stack on
the LAN with only environment variables changed and no source edited. See `DEPLOYMENT.md`.
