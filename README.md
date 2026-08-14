# Collab Dashboard

A real-time collaborative whiteboard: React 19 + Canvas API on the front, Express 5 +
Socket.io on the back. Sessions, live cursors, shared strokes, roles, comments.

![License](https://img.shields.io/badge/license-MIT-green)

> **Status: under active repair.**
> The core journey works as of Sprint 1 — two people can open one board and draw together,
> with live cursors, correct roles and working undo, verified in two real browser windows.
> What remains is listed below: nothing persists across a restart, several UI features are
> not wired to the server, and it cannot yet be deployed. The specific defects are
> listed in [Known issues](#known-issues) below and are being worked in the order set by
> [`masterplan.md`](masterplan.md). This section will shrink as sprints close.

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
| All state is `new Map()` in memory, and sessions are deleted when the last user leaves | **Nothing survives a restart**, and it cannot scale past one process | Sprint 2 |
| Socket URL and CORS origins are hardcoded to `localhost`; there are zero HTTP routes | Cannot be deployed anywhere | Sprint 6 |
| Zero tests | No regression safety | Sprint 5 |
| UI is unstyled against the project's design system | Reads as unfinished; panels overlap | Sprint 4 |

---

## What actually works today

Verified by running the server and driving it with scripted socket clients:

- **16 socket handlers** — session create/join, cursor-move, camera-change, stroke-draw,
  shape-draw, text add/update/delete, undo, redo, comment add/resolve, role-change,
  latency-ping, disconnect.
- **A real role/permission model** — `collab-backend/roles.js` plus 388 LOC of client-side
  permission logic. Every mutating socket handler checks it before acting.
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
| State | In-memory `Map` — **not persistent**, see Sprint 2 |

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

The backend reads `PORT` from the environment (default `3001`). Everything else is still
hardcoded to localhost — see Sprint 6.

---

## Repository layout

```
collab-dashboard/
├── collab-backend/          Express 5 + Socket.io  (1,056 LOC)
│   ├── server.js            16 socket handlers, in-memory session store
│   └── roles.js             role hierarchy + permission matrix
├── collab-frontend/         React 19 + Vite 7      (6,330 LOC)
│   └── src/
│       ├── App.jsx          session orchestration
│       ├── components/      Canvas, UserList, CursorPresence, panels
│       ├── hooks/           useSocket, useSessionState
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
