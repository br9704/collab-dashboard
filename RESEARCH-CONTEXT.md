# RESEARCH-CONTEXT.md — COLLAB DASHBOARD
# Measured audit + external research. Read before the engineer prompt's Phase 1.

**Audited:** August 2026, from a clean clone of `github.com/br9704/collab-dashboard`.

---

## 0. RUNTIME VERDICT — read this first

An earlier pass of this audit only checked that it **builds**. It does. That was misleading. When actually run — backend on :3001, frontend served, driven with a real browser — **the core user journey is broken.**

Test performed: launch backend, launch frontend, open the app, click **New Session**, wait 5s, inspect.

| Observed | Severity |
|---|---|
| **The session creator is assigned role `VIEWER` and the board renders "👁️ View Only Mode".** You cannot draw on the whiteboard you just created. | **Blocker.** This is the entire product. |
| **`ONLINE (0)`** — the connected user isn't counted in presence, despite the socket showing `CONNECTED` and a 2 ms latency ping. | **Blocker.** Presence is a headline feature. |
| Layout collapses: "Exit Session" overlaps the toolbar; the latency widget overlaps the ONLINE panel; the right sidebar is mostly empty space; the toolbar is an unstyled vertical stack of emoji. | High — it reads as unfinished. |
| Console: `Failed to load resource: 404` on load. | Medium |

**So the honest state is: a real socket layer underneath a broken role/presence layer and an unfinished UI.** The ~18 socket handlers are genuine work, and latency really is ~2 ms locally — but none of that is reachable by a user, because the creator can't draw and presence never registers.

**This changes the priority order.** Deployability (§2) is no longer the first problem — *it doesn't work on localhost either*. Fix the role assignment and presence registration first; there is no point deploying a whiteboard nobody can draw on.

---

## 1. Measured state

Two unlinked subprojects with **no root `package.json` and no workspace config**:

| | `collab-backend/` | `collab-frontend/` |
|---|---|---|
| Stack | Express 5.2, socket.io 4.8, uuid 13.0, cors 2.8, dotenv 17.3 (CommonJS) | React 19.2, Vite 7.3, socket.io-client 4.8, Canvas API |
| LOC | 1,056 (`server.js` 886, `roles.js` 170) | 6,330 across 22 JS/JSX files |
| Install | clean, 88 packages | clean, 73 packages |
| Build | **no build script** | **exit 0**, 109 modules, 2.03s, 315 kB, no warnings |
| Typecheck | none | none |
| Tests | `"test": "echo \"Error: no test specified\" && exit 1"` — **fails by construction** | no test script |

**Boot check** — backend starts correctly:
```
[SERVER] Listening on port 3001
[FEATURES] Sprints 10-18 enabled: Persistence, Undo/Redo, Camera Sync, Presence, Comments, Roles, Activity Log, Shape Recognition
```
But `curl http://localhost:3001/` and `/health` **both return Express's default 404 HTML** — confirming there are no HTTP routes at all.

**What's genuinely built:** ~18 socket handlers in `server.js` — `session-create`, `session-join`, `cursor-move`, `camera-change`, `stroke-draw`, `shape-draw`, `text-add/update/delete`, `undo`, `redo`, `comment-add`, `comment-resolve`, `role-change`, `latency-ping`, `disconnect`. No TODO/FIXME in src. `src/utils/shapeRecognition.js` is 447 LOC of real geometric heuristics. `utils/permissions.js` is 388 LOC of role logic.

---

## 2. Why it cannot be deployed (exact locations)

1. **Socket URL hardcoded to localhost, twice:**
   - `collab-frontend/src/App.jsx:44` — `useSocket('http://localhost:3001')`
   - `collab-frontend/src/hooks/useSocket.js:11` — same literal as the default
   - No `VITE_*` env var exists anywhere in the frontend. **A deployed frontend would try to reach the visitor's own localhost.**
2. **CORS hardcoded to localhost** — `server.js:15`: `origin: ['http://localhost:5173', 'http://localhost:3000']`. Any deployed frontend is blocked.
3. **No `/health` route** — Railway/Render/Fly health checks require one.
4. No `.env`, `.env.example`, `vercel.json`, `Procfile`, `Dockerfile`, or CI anywhere.

The one deploy-friendly thing present: the backend correctly reads `process.env.PORT` (`server.js:23`).

---

## 3. The credibility gaps

1. **All state is in memory** — `const sessions = new Map()` at `server.js:30`. Every session, stroke, comment and role is lost on restart, and it cannot scale past one process. **Yet the boot log and docs headline "Persistence."** This is the single biggest gap in the repo: "real-time collaborative whiteboard" that forgets everything on redeploy.
2. **Zero tests**, against **10 `TEST_REPORT_*.md` and 4 `VERIFICATION_REPORT_*.md`** files (40 markdown files total).
   *(Corrected 2026-08-15: this audit originally said 11. Recounted against the pre-repair tree
   itself — `git ls-tree -r --name-only 6b52410 | grep -c TEST_REPORT` — it is 10, so 14 report
   files, not 15. See `masterplan.md`.)*
3. **"AI shape completion"** is geometric heuristics. Legitimate engineering — but the "AI" framing will not survive an interview question, and it's *more* impressive described honestly as shape recognition than as fake AI.
4. **TypeScript 5.9 is a devDependency with not one `.ts`/`.tsx` file.** `tsconfig.json` is dead config.
5. **No LICENSE** despite the MIT badge in the README. Backend `package.json`: `license: "ISC"` (npm default, contradicts the README), `main: "index.js"` (the entry is `server.js`), and empty `description`/`author`/`keywords`.
6. **Every commit authored by "Subagent" `<agent@openclaw>`.** Last commit 2026-03-11. Conventional-commit format and descriptive messages, but a large fraction of the visible 30 are cosmetic colour churn.
7. **"50–80ms sync"** in the portfolio copy is unverified — though there *is* a `latency-ping` handler, so it is directly measurable. Measure it before it's published anywhere.

---

## 4. External research — the persistence decision

This is the project's one genuinely interesting engineering fork, and the answer determines whether the repo becomes interview-worthy or stays a prototype.

| Option | Effort | What it signals |
|---|---|---|
| **Redis** (Upstash/Railway) | Low | Pragmatic. Natural fit for ephemeral session state, trivial to host, solves restart-loss and multi-process. Doesn't demonstrate anything novel. |
| **SQLite / Postgres** | Medium | Durable, queryable history, enables session replay and an activity log that survives. Heavier write path for high-frequency cursor/stroke events — needs batching or a hot/cold split (Redis hot, Postgres cold). |
| **CRDT (Yjs / Automerge)** | High | **The actually impressive answer for a collaborative whiteboard.** Solves persistence, conflict resolution, and offline editing in one architectural move, and is what production tools in this category use. Largest scope: the existing stroke/shape/text model would need remodelling onto shared types. |

Research Yjs's cost against the current model before deciding. A middle path exists: Yjs for the document (strokes/shapes/text), plain socket events for ephemeral presence (cursors, camera) — which is how most real implementations split it.

**Deploy topology** (all options): static frontend on Vercel + a **long-lived WebSocket backend** on Railway/Fly/Render. Serverless does not host WebSockets — the backend needs a real always-on process, which has a cost implication worth confirming with Bruno.

---

## 5. The three highest-leverage gaps

1. **Make it deployable at all.** Env-parameterize the two hardcoded socket URLs (`App.jsx:44`, `useSocket.js:11` → `import.meta.env.VITE_SOCKET_URL`), replace the `server.js:15` CORS array with a `CORS_ORIGIN` env var, add `GET /health`, ship `.env.example` both sides, then deploy. **Without this it literally cannot run anywhere but one laptop.**
2. **Add persistence, or stop claiming it.** The in-memory `Map` at `server.js:30` is the biggest credibility gap. Genuinely impressive and interview-defensible if done properly; if out of scope, remove "Persistence" from every doc and the boot banner.
3. **Purge the 40 docs, add a demo GIF, add a smoke test.** A two-browser-window GIF of live cursors at the top of the README is what actually sells this — nothing currently in the repo communicates what it does. Then even a handful of Vitest tests over `utils/permissions.js` (388 LOC of pure role logic) and backend `roles.js` closes the 11-test-reports-zero-tests gap cheaply.

---

## 6. The honest strategic question

Of Bruno's three GitHub-only repos, this one needs the most engineering to become a net positive. gitpulse is finished and one publish away; the 3D visualizer needs a deploy and a screenshot. This one needs deployability, persistence, tests, doc purging, and authorship rewriting before it helps rather than hurts.

**Worth asking the owner directly whether to invest here or archive it.** There is an honest case either way — but it should be a decision, not a default.

*Resolved (Aug 2026): fix it, not archive it. Nine sprints followed; `masterplan.md` is the record.*
