# CLAUDE.md — COLLAB DASHBOARD
# Real-time collaborative whiteboard.

Read this at the start of every session. `masterplan.md` (created in Phase 3 of `ENGINEERPROMPT.md`) is the source of truth for sequencing. `RESEARCH-CONTEXT.md` is the measured audit — read it before trusting the README or the boot banner, both of which currently claim things the code does not do.

---

## Owner

| | |
|---|---|
| Name | Bruno Jaamaa · jaamaabruno@gmail.com · GitHub `br9704` |
| Repo | github.com/br9704/collab-dashboard |
| Live URL | **None**, and it cannot currently be deployed anywhere. |

## ⛔ Read before writing any code

**The core journey is broken.** Verified by running backend + frontend and driving the app in a real browser:

- Click **New Session** → you are assigned role `VIEWER` on the board you just created. It renders "👁️ View Only Mode". **You cannot draw on your own whiteboard.**
- **`ONLINE (0)`** — the connected user is not counted in presence, despite the socket reporting `CONNECTED` at a 2 ms ping.
- Panels overlap: "Exit Session" over the toolbar, the latency widget over the ONLINE panel. The toolbar is an unstyled vertical emoji stack.
- One `404` console error on load.

**Fix role assignment and presence registration first.** Prove two browser windows can draw together on localhost before any deploy work. There is no point hosting a whiteboard nobody can draw on.

## What this is

Two unlinked subprojects with no root workspace config:
- `collab-backend/` — Express 5 + Socket.io, CommonJS, 1,056 LOC. ~18 socket handlers (session create/join, cursor-move, camera-change, stroke/shape draw, text CRUD, undo/redo, comments, role-change, latency-ping).
- `collab-frontend/` — React 19 + Vite 7 + Canvas API, 6,330 LOC across 22 files.

The socket layer underneath is genuine work. None of it is reachable by a user.

## Locked decisions (do not relitigate)

- **Working on localhost comes before deployability, which comes before features.** The order is: role/presence bug → honesty pass → env-parameterisation → deploy → persistence.
- **Claim only what the code does.** Three current violations: the boot banner and docs headline *"Persistence"* while all state is `const sessions = new Map()` at `server.js:30`, lost on every restart. *"AI shape completion"* is 447 LOC of geometric heuristics — **rename it to shape recognition; it is more impressive honest than as fake AI.** The portfolio's *"50–80ms sync"* is unverified (though measurable via the existing `latency-ping` handler).
- **Nothing may stay hardcoded to localhost.** `collab-frontend/src/App.jsx:44` and `src/hooks/useSocket.js:11` both hardcode `http://localhost:3001`; `server.js:15` hardcodes the CORS origin array. These become `VITE_SOCKET_URL` and `CORS_ORIGIN`. A `GET /health` route is required — there are currently **zero HTTP routes**.
- **Deploy topology:** static frontend on Vercel + a long-lived WebSocket backend on Railway/Fly. **Serverless cannot host WebSockets** — this needs a real always-on process, which costs money (`ask_human`).
- **Docs are not process artifacts.** 40 markdown files including 11 `TEST_REPORT_*.md` and 4 `VERIFICATION_REPORT_*.md`, against **zero tests**. Keep README + DEPLOYMENT + API; delete the rest.
- **TypeScript 5.9 is a devDependency with zero `.ts`/`.tsx` files.** Either adopt TS properly or remove the dead `tsconfig.json`. Do not leave it ambiguous.
- **No LICENSE** despite the MIT badge; backend `package.json` says `ISC`, `main` points at a nonexistent `index.js`, and `description`/`author`/`keywords` are empty. Fix all of it.

## The one interesting architectural fork

Persistence. This decision defines whether the repo becomes interview-worthy or stays a prototype:

| Option | Effort | Signal |
|---|---|---|
| Redis | Low | Pragmatic. Solves restart-loss and multi-process. Demonstrates nothing novel. |
| SQLite/Postgres | Medium | Durable, queryable history, session replay. Heavier write path for cursor/stroke events — needs batching or a hot/cold split. |
| **Yjs / Automerge (CRDT)** | High | What production whiteboards actually use. Solves persistence, conflict resolution and offline in one move. Largest scope. |

Common middle path: CRDT for the document (strokes/shapes/text), plain socket events for ephemeral presence (cursors, camera). `record_decision` whichever is chosen, with the why.

## The open strategic question

Of Bruno's three GitHub repos this needs the most engineering to become a net positive. **Archiving it is a defensible choice** and `ENGINEERPROMPT.md` asks him directly. Do not begin Sprint 1 until that is answered.

---

## Aethereum sync — required workflow (canonical block, identical across every project)

This project coordinates through Aethereum. Account config lives at `~/.aethereum/config.json` and this machine is already logged in.

- **First session:** run `aethereum init` in the repo root and create/join this project's room.
- **`share_intent`** — one line at the start of every sprint, before any code. Marking a task complete without having shared intent for its sprint is a workflow violation.
- **`declare_contract`** — for every interface other code consumes. Here: the socket event schema and the role/permission model.
- **`record_decision`** — at every architectural fork or irreversible choice, with the *why*. Here especially: the persistence fork and the keep-or-archive call.
- **`ask_human`** — whenever the decision is Bruno's: spending money (this one needs an always-on backend), publishing, deleting, rewriting git history, naming, or anything with an external side effect. Do not guess and do not block.
- **`record_verification`** — at every sprint gate, pass/fail with evidence. For this repo, evidence means two browser windows drawing together.

## Masterplan discipline (canonical block)

The masterplan is the **single source of truth for sequencing**. This file is the source of truth for *rules*. Precedence on conflict: masterplan (sequencing) > CLAUDE.md (rules) > ENGINEERPROMPT.md (kickoff).

- Status keys, used live in the file as work happens: `[ ]` not started · `[~]` in progress · `[x]` complete · `[⏭]` deferred (always with a one-line reason).
- **Never delete or rewrite masterplan content.** Expand it in place — add sub-tasks, file paths, edge cases, findings. Deepen, don't replace.
- Mark tasks as you go, never batched at the end of a session.
- A sprint closes only when its acceptance criteria pass. Then: fill the **As-shipped delta** and **Deferred** notes, move the Current-sprint pointer, and update the Current-state line at the bottom of this file.
- Never skip a sprint. Never partially complete one and move on.
- Stop and report at every sprint close before starting the next.

## Honesty rules (canonical block)

- Never state a number in a README, the site, or any public copy that a committed artifact cannot back.
- Verified counts only — never restate a figure from memory.
- If a claim and the code disagree, that is a bug in one of them. Fix it or flag it; never leave it ambiguous.
- `[PLACEHOLDER — description]` for anything unknown. Never invent content.

---

## Current state

> Update at every sprint close.

**Current state (after Sprint 0, 2026-08-14):** `masterplan.md` written; Sprint 0 closed.
Docs 40 → 10, MIT LICENSE added, both `package.json`s corrected, root npm-workspace added,
unused TypeScript dep removed, the lying "Persistence" boot banner and the no-op auto-save
interval deleted, "AI shape completion" renamed to shape recognition throughout, README
rewritten with a measured known-issues table.

**Sprint 1 closed — the core journey works.** Verified in two real Chromium windows (15/15)
and at protocol level with scripted socket clients (14/14): the creator is a `creator` and
can draw, presence reads `ONLINE (2)`, a stroke drawn in one window renders in the other,
remote cursors move, Ctrl+Z removes the ink in **both** windows, and there are zero console
errors and zero failed requests. Root cause was a single race — `user-joined` broadcast
before the client could subscribe — fixed by seeding state from the ack, which already
carried the right answer. Three further blockers found and fixed along the way:
`cursor-move` was never emitted by the app at all; the session id was truncated in the only
place it was shown, so nobody could join; and the canvas bitmap was sized from the window
rather than its own box, so ink landed offset from the pointer.

**Sprint 2 closed — the board persists.** Strokes, shapes, text and comments moved into a
Yjs document served by Hocuspocus 4 and stored in SQLite; cursors/camera/drawing-state moved
to Awareness (ephemeral by design); sessions and roles persist in SQLite. Proved by killing
the server process and starting a new one: 1,670 px of ink restored exactly, in a browser
profile with an empty IndexedDB. The role model is enforced **at the connection** — a viewer
holding a valid token can read the document but its writes are rejected server-side, verified
by driving the wire protocol with no UI involved. `GET /health` and `GET /` shipped early.

Two things the gate itself uncovered: membership was keyed by `socket.id`, so persisted roles
could never be reclaimed (a creator reloading came back as a viewer) — fixed with a stable
per-browser client id; and Hocuspocus 4 runs on `crossws`, so hosting it on a plain `ws`
server requires pumping `message`/`close` in by hand, otherwise the socket opens, the client
says "connected", and nothing ever syncs with no error at all.

Still open: 13 client events have no server handler, and their panels are hidden rather than
dead (Sprint 3); UI unstyled against SIGNAL with overlapping panels (Sprint 4); zero tests,
and offline *write*-and-reconcile still unproven (Sprint 5); undeployable — hardcoded
localhost URLs (Sprint 6); commits authored by "Subagent" (Sprint 8, owner-gated).

Keep-or-archive: **decided — fix it** (locked in ENGINEERPROMPT, Aug 2026).

## MOTION.md (binding)

`MOTION.md` in this folder is the animation specification — sequences, timings, per-surface rules, acceptance gates. It has the same authority as this file. When you author `masterplan.md` in Phase 3, fold its acceptance checklist into the relevant sprint gates and reference it from the plan.
