# Collab Dashboard

A real-time collaborative whiteboard: React 19 + Canvas API on the front, Express 5 +
Socket.io on the back. Sessions, live cursors, shared strokes, roles, comments.

![License](https://img.shields.io/badge/license-MIT-green)

> **Status: under active repair.**
> Two people can open one board and draw together — live cursors, correct roles, working
> undo — and **the board survives a server restart**. Verified in real browser windows
> against a real process kill. What remains is listed below: several UI features are still
> not wired to the server, and it cannot yet be deployed. Work follows
> [`masterplan.md`](masterplan.md); this section shrinks as sprints close.

---

## Known issues

These are measured, not suspected. Each links to the sprint that closes it.

| Issue | Effect | Fixed in |
|---|---|---|
| ~~Session state broadcast before the client subscribes~~ | ~~creator assigned `viewer`; `ONLINE (0)`~~ | **fixed, Sprint 1** |
| ~~`cursor-move` never emitted~~ | ~~live cursors never transmit~~ | **fixed, Sprint 1** |
| ~~bare `socket.off(event)` unhooks other components~~ | ~~remote cursors silently stopped rendering~~ | **fixed, Sprint 1** |
| ~~`Session.undo()` only moves an index~~ | ~~Ctrl+Z changed a number; no ink disappeared~~ | **fixed, Sprint 1** |
| 13 client events have no server handler | Templates, Smart Shapes, Layers, Text Formatting and Video Embed do nothing at all | Sprint 3 |
| ~~All state in memory; sessions deleted when the last user leaves~~ | ~~nothing survived a restart~~ | **fixed, Sprint 2** |
| Socket URL and CORS origins are hardcoded to `localhost` | Cannot be deployed anywhere yet | Sprint 6 |
| Zero tests | No regression safety | Sprint 5 |
| UI is unstyled against the project's design system | Reads as unfinished; panels overlap | Sprint 4 |

---

## What actually works today

Verified by running the server and driving it with scripted clients and real browsers:

- **A collaborative board that persists.** Strokes, shapes, text and comments live in a Yjs
  (CRDT) document served by Hocuspocus and stored in SQLite. Kill the server, start it again,
  reopen the id — the board is still there. Concurrent edits merge rather than clobber.
- **Live presence** — cursors, camera and "who is drawing" ride the Yjs Awareness protocol.
  Ephemeral by design: presence is about who is here *now*, and is never written to disk.
- **Offline read** — `y-indexeddb` caches the document locally, so a board renders before the
  network answers. (Editing *while* offline and reconciling is wired but not yet verified —
  see Sprint 5.)
- **Per-user undo** — a `Y.UndoManager` scoped to your own edits. Ctrl+Z undoes *your* last
  action, not whatever happened most recently on the board.
- **A role model enforced at the connection, not in the UI** — `collab-backend/roles.js`.
  Viewers get a read-only document connection, so a viewer writing straight into the CRDT and
  bypassing the interface entirely is rejected server-side. Tokens are refused for
  non-members and for a different board than the one they were minted for.
- **Shape recognition** — `collab-frontend/src/utils/shapeRecognition.js`, 447 LOC of
  geometric heuristics that snap a rough stroke to a clean rectangle, circle, line, triangle,
  diamond or arrow. **This is geometry, not machine learning.** It was previously described
  as "AI shape completion"; it is more interesting stated honestly.
- **Latency instrumentation** — a `latency-ping`/`latency-pong` round trip you can measure.

### Measured latency

200 round trips over loopback, via the `latency-ping` handler:

```
p50 = 0.25 ms   p95 = 0.41 ms   p99 = 0.62 ms
```

This shows the application adds essentially no overhead on top of the transport. **It is not
a network sync figure** — that requires a deployed, cross-network measurement, which has not
been taken yet. No sync-latency number is claimed here until it has been.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, Vite 7 |
| Drawing | Canvas 2D API |
| Transport | Socket.io 4.8 (client + server) |
| Server | Express 5, Node 22+ |
| Document | Yjs 13 (CRDT) via Hocuspocus 4 |
| Persistence | SQLite (`better-sqlite3`) — documents, sessions and roles |
| Offline | IndexedDB via `y-indexeddb` |

---

## Running it locally

```bash
npm install          # installs both workspaces
npm run dev          # backend on :3001, frontend on :5173
```

Or per workspace:

```bash
npm run dev --workspace collab-backend
npm run dev --workspace collab-frontend
```

The backend reads `PORT` from the environment (default `3001`) and writes its SQLite
database to `collab-backend/data/` (override with `DATABASE_PATH`). The socket and document
URLs are still hardcoded to localhost — see Sprint 6.

Endpoints: `GET /health` reports uptime, session count and live document/connection counts;
the Yjs document server is at `ws://<host>/collaboration`.

---

## Repository layout

```
collab-dashboard/
├── collab-backend/          Express 5 + Socket.io + Hocuspocus
│   ├── server.js            control plane: sessions, roles, activity, /health
│   ├── collab-doc.js        Yjs document server + connection-level permissions
│   ├── store.js             SQLite: sessions and membership
│   └── roles.js             role hierarchy + permission matrix
├── collab-frontend/         React 19 + Vite 7      (6,330 LOC)
│   └── src/
│       ├── App.jsx          session orchestration
│       ├── collab/          document model + stable browser identity
│       ├── components/      Canvas, UserList, CursorPresence, panels
│       ├── hooks/           useSocket, useSessionState, useCollabDoc
│       └── utils/           permissions, shapeRecognition, shapeUtils
├── masterplan.md            sequencing — the source of truth for what happens next
├── CLAUDE.md                project rules
├── MOTION.md                animation specification (binding)
├── API.md                   socket event reference
└── DEPLOYMENT.md            deployment notes
```

---

## Contributing / working on this

Read [`CLAUDE.md`](CLAUDE.md) first, then [`masterplan.md`](masterplan.md). Sprints run in
order and each one closes on an acceptance gate with recorded evidence. The honesty rule is
binding: **nothing gets claimed in this README that a committed artifact cannot back.**

## License

MIT — see [LICENSE](LICENSE).
