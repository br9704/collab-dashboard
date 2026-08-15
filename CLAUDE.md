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
- **Claim only what the code does.** Three current violations: the boot banner and docs headline *"Persistence"* while all state is `const sessions = new Map()` at `server.js:30`, lost on every restart. *"AI shape completion"* is 447 LOC of geometric heuristics — **rename it to shape recognition; it is more impressive honest than as fake AI.** *(All three were resolved in Sprints 0–5. The file is now 588 lines after the Sprint 5 bug fixes; the original 447 stands as the figure at audit time.)* The portfolio's *"50–80ms sync"* is unverified (though measurable via the existing `latency-ping` handler).
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

**Sprint 3 closed — no emitter without a receiver.** The 13 orphaned events are implemented
on the document (layers, templates, smart shapes, text formatting, video embeds) or on
sockets where they are genuinely ephemeral (tool selection, permission overrides). The
emitted-minus-handled set is empty. 44 checks green across four harnesses. `API.md` rewritten
as the authoritative contract.

Two bugs the gate exposed were correctness, not polish: the canvas measured **1440 px wide
inside a ~870 px visible area** (flex `min-width: auto`), so you could draw where you could
not see and clicks landed on the sidebar; and `readElements` spread a stored `id` over the
authoritative Map key, so every video embed came back with `id: undefined`.

**Sprint 4 closed — SIGNAL applied, MOTION met.** One system file (`styles/signal.css`)
replaces 4,468 lines across 24 stylesheets; CSS bundle 54 kB → 22 kB. Zero emoji, zero
off-system colours, radius ≤ 2px, verified against the live DOM. Remote cursors ease on a
time-based curve; remote strokes draw progressively via Awareness while the document still
takes one operation per finished stroke; own ink paints before any document write. Reduced
motion snaps and loops nothing. 56 checks green across five harnesses.

Two things worth remembering: the canvas 2D bitmap was still painted `#ffffff` long after the
CSS was dark — restyling CSS does not touch a canvas fill; and the overlapping-panels bug was
one cause, every floating readout positioned into the same corner, now given explicit lanes.

**Sprint 5 closed — 95 tests, and they earned their keep.** Writing them found **seven real
bugs**: strokes never stored a `layerId` (so layers only appeared to work); corner detection
was inverted, flagging every point on a straight edge as a corner — 46 on a 48-point
rectangle — which meant rectangle/triangle/diamond recognition could never fire on a real
stroke; corner detection was not cyclic, losing a closed shape's starting corner; `tryCircle`
had no roundness test, so rectangles were recognised as circles; the corner-count gates
overlapped so a flat constant picked the winner; accepting a recognition added a clean shape
without removing the rough stroke; and fixing that exposed recognised lines/triangles/
diamonds/arrows rendering nothing at all.

The offline clause deferred from Sprint 2 is closed: one browser goes offline, keeps drawing,
another edits concurrently, and both converge with nothing clobbered. Note the honest scope —
IndexedDB caches the *document*, not the app shell; there is no service worker.

**Sprint 6 closed — it can be deployed.** Verified by running the whole stack on the LAN with
**only environment variables changed and not one line of source edited**: backend on
`0.0.0.0:3001` reachable at `192.168.1.111`, frontend built with `VITE_SOCKET_URL` pointing
at it, two real browsers driving it 15/15. CORS is genuinely enforced — the allowed origin
gets the header, a disallowed one gets none, on both the HTTP and socket.io surfaces.

One variable does it: the Yjs document URL is derived from `VITE_SOCKET_URL`, `ws://` → `wss://`
included. `fly.toml` carries the two decisions that would otherwise lose data silently — a
mounted volume, and exactly one machine (documents live in the serving process's memory, so
two machines would diverge while both looked healthy). `DEPLOYMENT.md` was rewritten, not
patched; the old one documented three things that did not exist.

**Sprint 7 closed — the demo exists and the numbers are measured.** `docs/demo.gif` is one
continuous 22.7 s take from the creator's window with a second browser genuinely driving the
other side: join, live cursors, a stroke drawing progressively, a shape snapping, a comment
resolved. End-to-end sync (stroke committed by A → element present in B, everything included)
is **p50 8 ms loopback, 7 ms / p95 16 ms over the LAN**, reproducible via
`benchmarks/sync-latency.cjs`. All eight acceptance harnesses now live in `benchmarks/`.

**Recording the demo found a product bug** — the best argument for recording one. A hand-drawn
zigzag was silently replaced by a straight line, because linearity was measured locally (a
smooth wave is locally straight everywhere) and accepting a recognition replaces the stroke.
`tryLine` now measures global straightness, and auto-keep is gated at 0.85 confidence: below
that, doing nothing keeps *your* stroke. Silence must never cost a user their work.

The "50–80ms sync" portfolio line is still **unbacked** — not contradicted, just about a
deployment that does not exist. It gets measured in Sprint 8 or dropped.

**Sprint 8 closed — ALL NINE SPRINTS DONE.** The authorship rewrite ran with approval:
54/54 commits now attributed to Bruno, dates preserved, working tree byte-identical, pushed
with `--force-with-lease` (`6248294 → f4fac6f`). **CI ran on GitHub for the first time and
passed**, both jobs. A pre-publication audit — not in the plan, and it should have been —
caught `.claude/`/`.codex/`/`.cursor/` being tracked with absolute local paths, and a
benchmark hardcoded to this laptop. Both fixed before the push. Two history bundles were taken
first, because `git filter-repo` rewrites the backup branch too.

Three items are Bruno's to run, by his own choice, each with its exact command in
`docs/RELEASE.md`: deploy to Fly + Vercel, measure deployed latency, update the portfolio
copy. The `[MEASURE ON DEPLOY]` placeholder stays until there is a real number — the
"50–80ms sync" line is still unbacked.

**The ENGINEERPROMPT bar is half met, and saying so is the point.** State survives a server
restart (verified by killing the process) and two people draw together on one board (15/15,
including over the LAN against a non-localhost backend). But "two people on *different
machines* open a *URL*" is not met: nothing is deployed, and every measurement has both
browsers on one machine.

Still not true, all in the README's Known limits table: no live URL, no internet latency
figure, one machine only, no authentication, offline caches the document but not the app
shell, synchronised camera published but unconsumed.

**Sprint D closed (2026-08-15) — the repo has a front door.** `README.md` rewritten to the
documentation brief: the demo GIF and a four-row results table above the fold, a Mermaid
architecture diagram, and a *How it was built* section that says what the audit found and what
measurement changed. `PROJECT.json` at the root is the machine-readable card the portfolio reads —
every `metrics[].source` points at a file that exists, and `honest` carries what is not true.
70 scripted checks plus GitHub's own renderer; 95/95 tests and the build still green.

Three things the pass turned up. The **GitHub repo card was lying in public** — description said
"project management dashboard … TypeScript", topics included `typescript` and `tailwindcss`; fixed
with `gh repo edit` and mirrored into `PROJECT.json`. **`collab-frontend/tsconfig.json` existed and
was tracked**, contradicting this file's masterplan correction #2 — deleted, per the locked
"do not leave it ambiguous". And `REDESIGN_SUMMARY.txt` survived Sprint 0's purge because that
purge counted `.md` files.

Keep-or-archive: **decided — fix it** (locked in ENGINEERPROMPT, Aug 2026).

## MOTION.md (binding)

`MOTION.md` in this folder is the animation specification — sequences, timings, per-surface rules, acceptance gates. It has the same authority as this file. When you author `masterplan.md` in Phase 3, fold its acceptance checklist into the relevant sprint gates and reference it from the plan.
