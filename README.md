# Collab Dashboard

A real-time collaborative whiteboard. Two people open the same board and draw together — live
cursors, shared strokes, roles, comments — and the board is still there after the server
restarts.

![Two browsers collaborating on one board](docs/demo.gif)

*One continuous take, recorded from the creator's window while a second browser drives the
other side over a real socket. Someone joins · their cursor moves · their stroke draws as it
happens · a rough circle snaps to a clean one · a comment is left and resolved. Nothing is
staged or sped up — regenerate it with `node benchmarks/record-demo.cjs`.*

[![CI](https://github.com/br9704/collab-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/br9704/collab-dashboard/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

- **A shared board that persists.** Strokes, shapes, text, layers and comments live in a Yjs
  (CRDT) document served by Hocuspocus and stored in SQLite. Kill the server, start it again,
  reopen the id — the board is still there, and concurrent edits merge instead of clobbering.
- **Live presence.** Cursors, camera and "who is drawing" ride the Yjs Awareness protocol.
  Ephemeral by design: presence is about who is here *now*, and is never written to disk.
- **Offline editing that reconciles.** Pull the network, keep drawing, come back — your work
  and everyone else's both survive and converge.
- **A role model enforced at the connection, not in the UI.** Viewers get a read-only document
  connection, so a viewer writing straight into the CRDT and bypassing the interface entirely
  is rejected server-side.
- **Shape recognition.** 588 lines of geometric heuristics that snap a rough stroke to a clean
  rectangle, circle, line, triangle, diamond or arrow. **This is geometry, not machine
  learning** — it was once described as "AI shape completion", and it is more interesting
  stated honestly.
- **Motion built for collaboration.** On a shared whiteboard, most movement on screen is other
  people. Remote cursors ease on a time-based curve (identical at 30/60/144 Hz); remote
  strokes *draw* progressively as their points stream; your own ink is painted before any
  document write. All the latency budget goes on remote smoothness, never local.

---

## Measured sync latency

Time from one person finishing a stroke to it appearing on someone else's screen — the CRDT
update, the server relay, the remote apply and the render, all included.

| Environment | p50 | p95 | Samples |
|---|---|---|---|
| Loopback | **8 ms** | 9 ms | 30 |
| LAN over Wi-Fi | **7 ms** | 16 ms | 30 |

Reproduce with `node benchmarks/sync-latency.cjs`. Method, and an explicit list of what these
numbers do **not** say, in [`benchmarks/README.md`](benchmarks/README.md).

> **Both browsers run on one machine, and nothing is deployed yet, so there is no internet
> figure.** Over a real connection the number will be dominated by round-trip time to the
> server. It will be measured when there is something to measure — not estimated first.

---

## Running it

```bash
npm install     # installs both workspaces
npm run dev     # backend :3001, frontend :5173
```

No `.env` needed locally. To point the frontend at a backend elsewhere, set one variable and
rebuild:

```bash
VITE_SOCKET_URL=https://your-backend.example.com npm run build
```

The document URL is derived from it, `ws://` → `wss://` included. See
[DEPLOYMENT.md](DEPLOYMENT.md) — including the two mistakes that silently lose data.

Endpoints: `GET /health` reports uptime, session count and live document/connection counts;
the Yjs document server is at `ws://<host>/collaboration`.

---

## Tests

```bash
npm test        # both workspaces
```

**95 unit and integration tests.** They are not decoration: writing them found **seven real
bugs**, including corner detection that flagged every point on a straight edge as a corner —
46 on a 48-point rectangle — which meant rectangle, triangle and diamond recognition could
never fire on a real stroke.

| Suite | Covers |
|---|---|
| `roles.test.mjs` | the permission matrix, as properties — hierarchy, fail-closed on unknown input |
| `store.test.mjs` | durable membership, against a real SQLite file and a simulated restart |
| `session.integration.test.mjs` | the real server over a real socket — pins the original race |
| `permissions.test.js` | the client-side permission model |
| `shapeRecognition.test.js` | the geometry, on clean *and* hand-wobbled shapes |
| `doc.test.js` | the CRDT modelling rules and convergence under concurrent edits |

Browser-level acceptance gates live in [`benchmarks/`](benchmarks/) — two-window
collaboration, persistence across a real process kill, the CRDT permission boundary driven at
the wire, feature round-trips, the MOTION.md checklist, and offline reconciliation.

---

## Architecture

```
   browser ──── HTTPS ────▶  static frontend
      │
      ├──────── WSS ──────▶  /socket.io        ┐
      └──────── WSS ──────▶  /collaboration    ┘  ONE Node process
                                                    └── SQLite
```

| Layer | Owns | Durability |
|---|---|---|
| Y.Doc | strokes, shapes, text, comments, layers | persisted |
| Awareness | cursors, camera, is-drawing | ephemeral by design |
| SQLite | sessions, membership, roles | persisted |
| socket.io | session lifecycle, roles, activity feed | control plane |

Roles are deliberately **not** in the CRDT: every client with document write access could
otherwise edit its own role. The full contract is in [API.md](API.md).

**Serverless cannot host this backend** — a collaborative session is a long-lived WebSocket,
so it ships as a container. Both protocols share one port, because a free tier gives you one
always-on process.

```
collab-backend/          Express 5 + Socket.io + Hocuspocus
  server.js              control plane: sessions, roles, activity, /health
  collab-doc.js          Yjs document server + connection-level permissions
  store.js               SQLite: sessions and membership
  roles.js               role hierarchy + permission matrix
collab-frontend/         React 19 + Vite 7 + Canvas
  src/collab/            document model + stable browser identity
  src/hooks/             useSocket, useSessionState, useCollabDoc
  src/styles/signal.css  the whole design system, in one file
benchmarks/              acceptance gates and the latency harness
```

---

## Known limits

Stated here rather than discovered later:

| Limit | Why |
|---|---|
| **Not deployed anywhere** | Needs the owner's hosting accounts |
| **One machine only** | Documents live in the serving process's memory; scaling needs Redis pub/sub + Postgres |
| **No authentication** | The client id identifies a *browser*, not a person — anyone with a session id can open a board as a viewer |
| **Offline caches the document, not the app shell** | No service worker, so a reload while offline still needs the network |
| **Synchronised camera is unfinished** | Peers publish their camera over Awareness; nothing consumes it |

---

## Working on this

Read [CLAUDE.md](CLAUDE.md), then [masterplan.md](masterplan.md). Sprints run in order and each
closes on an acceptance gate with recorded evidence. The binding rule: **nothing gets claimed
here that a committed artifact cannot back.**

## License

MIT — see [LICENSE](LICENSE).
