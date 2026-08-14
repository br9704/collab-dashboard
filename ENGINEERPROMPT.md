# Engineer Prompt — COLLAB DASHBOARD
# github.com/br9704/collab-dashboard · *"Real-time collaborative whiteboard with 50–80ms sync."*

> **Setup:** clone the repo into this folder (`git clone https://github.com/br9704/collab-dashboard.git .`) and paste this as the opening message of a fresh Claude Code session there.
> Read `RESEARCH-CONTEXT.md` in this folder first. No masterplan exists; you will write one.
> **This is the weakest of the three GitHub repos and needs the most real engineering. Budget accordingly.**

---

## Where this actually stands (measured)

Two unlinked subprojects, `collab-backend/` (Express 5 + Socket.io) and `collab-frontend/` (React 19 + Vite 7 + Canvas API), with **no root package.json or workspace config**. Backend 1,056 LOC, frontend 6,330 LOC.

### ⛔ The core journey is broken — fix this before anything else

Verified by running backend + frontend and driving the app in a real browser. Click **New Session** and:

- **You are assigned role `VIEWER` on the session you just created.** The board renders "👁️ View Only Mode". **You cannot draw on your own whiteboard.**
- **`ONLINE (0)`** — you aren't counted in presence, despite the socket reporting `CONNECTED` with a 2 ms ping.
- Layout collapses: "Exit Session" overlaps the toolbar, the latency widget overlaps the ONLINE panel, the right sidebar is mostly empty, the toolbar is an unstyled vertical emoji stack.
- One `404` console error on load.

This reorders everything below. **Deployability is not the first problem — it doesn't work on localhost either.** Sprint 1 must fix role assignment on session-create and presence registration, and prove two browser windows can draw together locally, *before* any deploy work. There is no point hosting a whiteboard nobody can draw on.

---

**Underneath, more real than expected:** `server.js` implements ~18 socket handlers — session create/join, cursor-move, camera-change, stroke-draw, shape-draw, text CRUD, undo, redo, comment-add/resolve, role-change, latency-ping, disconnect. Frontend builds clean (exit 0, 2.03s, 315 kB). No TODOs. `utils/shapeRecognition.js` is 447 LOC of genuine geometric heuristics.

**But it cannot be deployed anywhere, and the docs claim things the code doesn't do:**

1. **The socket URL is hardcoded to localhost in two places** — `collab-frontend/src/App.jsx:44` calls `useSocket('http://localhost:3001')`, same literal as the default in `src/hooks/useSocket.js:11`. No `VITE_*` env var exists. A deployed frontend would try to reach the *visitor's own* localhost.
2. **CORS is hardcoded to localhost** — `server.js:15`: `origin: ['http://localhost:5173', 'http://localhost:3000']`. Any deployed frontend is blocked.
3. **Zero HTTP routes.** No `app.get`/`app.post` anywhere — including no `/health`, which Railway/Render/Fly health checks require. `curl /` returns Express's default 404.
4. **All state is in memory** — `const sessions = new Map()` at `server.js:30`. Every session, stroke, comment and role is lost on restart, and it cannot scale past one process. **Yet the boot log and docs headline "Persistence."** This is the biggest credibility gap in the repo.
5. **Zero tests**, against 11 `TEST_REPORT_*.md` and 4 `VERIFICATION_REPORT_*.md` files (40 markdown files total). Backend `npm test` is still the npm default `echo "Error: no test specified" && exit 1`.
6. **"AI shape completion"** is geometric heuristics. Legitimate work — but the "AI" framing will not survive an interview question. Rename it to what it is: shape recognition. It's more impressive as honest geometry than as fake AI.
7. TypeScript 5.9 is a devDependency with **not one `.ts`/`.tsx` file**; `tsconfig.json` is dead config.
8. **No LICENSE** despite the MIT badge; backend `package.json` says `ISC` (npm default), `main` points at a nonexistent `index.js`, description/author/keywords all empty.
9. Every commit authored by **"Subagent" <agent@openclaw>**, with a large fraction being cosmetic colour churn.

The "50–80ms sync" claim in the portfolio copy is unverified — there's a `latency-ping` handler, so it's measurable. Measure it before it's published anywhere.

---

## Phase 1 — Verify and research

1. Clone, install both subprojects, run them together. Open two browser windows and confirm the core loop: live cursors, shared strokes, presence. **This is the demo; know whether it's actually good.**
2. Confirm every finding above independently, especially the in-memory state and the hardcoded URLs.
3. **Measure the latency claim** using the existing `latency-ping` handler, locally and (later) deployed. Publish real p50/p95 numbers or drop the claim.
4. Research the persistence decision properly — this is the project's one genuinely interesting engineering fork:
   - **Redis** (fast, natural for ephemeral session state, easy on Railway/Upstash)
   - **SQLite/Postgres** (durable, queryable history, heavier)
   - **CRDT (Yjs/Automerge)** — the *actually impressive* answer for a collaborative whiteboard, and the one that would make this repo interview-worthy. Also the largest scope. Research what adopting Yjs would cost given the existing stroke/shape/text model.
   Report the three with honest effort estimates.
5. Research deploy topology: static frontend (Vercel) + a long-lived WebSocket backend (Railway/Fly/Render). Note that serverless does not host WebSockets — the backend needs a real process.

## Phase 2 — Questions (AskUserQuestion)

- **Persistence path:** Redis (pragmatic) vs SQLite/Postgres (durable) vs Yjs/CRDT (impressive, largest scope)? Or drop the "Persistence" claim from the docs and ship it honestly as ephemeral?
- Deploy budget — a WebSocket backend needs an always-on process. Railway/Fly free tiers, or is he paying?
- Git history: rewrite authorship from "Subagent" to Bruno? (His work, his repo — but it rewrites public history.)
- Confirm deleting the ~35 process markdown files and renaming "AI shape completion" → "shape recognition".
- Is this worth the investment at all, versus archiving it and putting the time into RIPPLE/UniSpace? **Ask this directly.** It's the weakest of the three and needs the most work; there's an honest case for parking it.

## Phase 3 — Plan mode → write `masterplan.md`

No masterplan exists. Write one, sprint-structured with acceptance gates, matching the conventions used in Bruno's other projects. Suggested spine:

- **Sprint 0 — Honesty + hygiene.** Delete ~35 process markdown files. Add LICENSE, fix backend package.json (`main`, `license`, description). Remove dead TypeScript config or actually adopt TS. Rename "AI shape completion". Remove "Persistence" from docs *or* commit to Sprint 2 building it. Root workspace config linking the two subprojects.
- **Sprint 1 — Make it deployable.** Replace the two hardcoded socket URLs with `import.meta.env.VITE_SOCKET_URL`. Replace the CORS array with a `CORS_ORIGIN` env var. Add `GET /health`. Ship `.env.example` both sides. **Then actually deploy** — frontend Vercel, backend Railway/Fly. *Without this it literally cannot run anywhere but one laptop.*
- **Sprint 2 — Persistence** (per the Phase-2 decision). Closes the biggest credibility gap.
- **Sprint 3 — The demo.** A two-browser-window GIF of live cursors at the top of the README. **This is what actually sells a collaborative whiteboard** — nothing else in the repo communicates it.
- **Sprint 4 — Tests + CI.** Start with the pure logic: `utils/permissions.js` (388 LOC of role logic) and backend `roles.js` (170 LOC). Cheap, high-value, closes the 11-test-reports-zero-tests gap.
- **Sprint 5 — Verified claims.** Publish measured latency numbers. Update portfolio copy to match reality.

## Phase 4 — Build

Work the masterplan in order. **aethereum sync**: `share_intent` per sprint, `declare_contract` for the socket event schema and the role/permission model, `record_decision` on the persistence fork (this one especially — it's the architectural choice that defines the project), `ask_human` on deploy spend and history rewrite, `record_verification` at gates.

## The bar

Two people on different machines can open a URL and draw together, and the state survives a server restart. Plus a README that claims only what the code does. Right now the honest description is "a well-built local prototype" — the goal is to make "real-time collaborative whiteboard" true.

---

## Design language — DO NOT invent one, and do not ask Bruno to design

Bruno has a locked design system. Any UI you build or fix **inherits it**. Never ask him to make a design decision you can answer by reading this; never introduce a new palette, font, or motion language.

**Source of truth:** `~/bruno-portfolio/CLAUDE.md` → "Redesign Design Decisions (2026-07 · SIGNAL)". Read it before touching any visual surface.

**The system — "SIGNAL": a warm-black precision instrument.** Ryoji Ikeda data-minimalism × cassette-futurist hardware × subtle broadcast-CRT texture. It should *operate* like a beautiful old machine — directory listings, keyboard nav, instrument readouts — while staying clean and fast.

```
--bg:             #050505   warm black
--surface:        #0b0a09
--text-primary:   #f0ece4   warm white
--text-secondary: #98928a
--text-dim:       #55504a
--amber:          #ffb000   THE ONE ACCENT (phosphor)
--steel:          #2c2925   visible border
--hairline:       #1b1916   structural rules
```

**Rules, non-negotiable:**
- **Amber is used sparingly** — cursor, status dots, CTAs, focus brackets, key data. Everything else is grayscale on hairline steel.
- **No light theme.** No gradients. No shadows. No colour beyond amber.
- **Border-radius max 2px.** Effectively square.
- **Monospace for data, labels, readouts, ASCII.** Terminal/instrument voice throughout: `</section>` labels, `>` prompt prefixes, `[button →]` brackets, box-drawing `┌─┐│└┘`, loading bars `[████░░░] 72%`.
- **Motion:** ease-out or linear only. No bounce, no spring, nothing over 600ms. Scroll reveals are fade + 16px rise, 400ms, 60ms stagger.
- **No emoji in UI.** If the current code uses emoji as controls, replace them with monospace glyphs or labelled brackets.
- **A11y is a hard rule:** nothing flashes more than 3×/s, `prefers-reduced-motion` means static everything, body text is always real DOM.

If a surface currently looks unstyled or default-browser, that is a bug against this system — fix it by applying the system, not by inventing something new.

---

## MOTION.md is binding

This folder now contains `MOTION.md` — the full animation specification for this project (sequences, timings, per-surface rules, acceptance gates). Read it in Phase 1 alongside the other docs. Its acceptance checklist merges into the relevant sprint gates in the masterplan during Phase 3. Motion here is product behaviour, not polish — the spec is authored; do not invent a different animation language and do not ask Bruno to design one.

---

## Decisions locked + research corrections (Aug 2026)

- **Bruno chose: FIX IT — full plan.** Not archived. Role bug → local two-window proof → honesty pass → deployability → persistence → demo GIF, in that order.
- **Persistence fork is decided: Yjs + Hocuspocus.** Verified current: `yjs` 13.6.x and `@hocuspocus/server` 4.x are actively maintained (both released within days of this audit); Hocuspocus 4 went stable May 2026 (Node 22+, auth hooks, SQLite persistence via better-sqlite3). The standard whiteboard pattern: one `Y.Doc` per board; a top-level `Y.Map` of elements; **strokes as immutable point arrays inserted once** (never one CRDT op per point); `Y.Text` for text; **cursors/presence via the Awareness protocol — ephemeral, never in the document**; `Y.UndoManager` scoped per user; `y-indexeddb` for offline. Realistic migration effort from the socket.io model: **1–2 solo-dev weeks** — the network swap is a day; the real work is remodelling state mutations into Y transactions. Alternatives (Automerge 3, Loro) were assessed and rejected: ecosystem breadth wins for this use case. Do not treat tldraw as a Yjs reference — it moved off Yjs.
- **Git history: full author rewrite keeping history** (`git filter-repo`, "Subagent <agent@openclaw>" → Bruno), force-push after `ask_human`. Same treatment as the 3D visualizer.
- Sequencing note: MOTION.md's presence interpolation specs apply to the *current* socket layer first (the two-window GIF doesn't wait for Yjs); the Yjs migration then inherits them via Awareness.
