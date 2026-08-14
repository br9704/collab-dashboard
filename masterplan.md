# masterplan.md — COLLAB DASHBOARD

**Source of truth for sequencing.** `CLAUDE.md` is the source of truth for rules; `MOTION.md`
is binding for animation. Precedence on conflict: masterplan (sequencing) > CLAUDE.md (rules)
> ENGINEERPROMPT.md (kickoff).

Status keys: `[ ]` not started · `[~]` in progress · `[x]` complete · `[⏭]` deferred (always
with a one-line reason).

**Rule:** never delete or rewrite content in this file. Expand it in place — add sub-tasks,
file paths, edge cases, findings. Deepen, don't replace.

**Current sprint pointer:** → Sprint 3 (Sprints 0–2 closed 2026-08-14)

---

## Measured baseline (2026-08-14)

Established by running the backend, driving it with scripted socket clients, and reading
every file in the socket path. These numbers are verified, not inherited.

| Fact | Value | Evidence |
|---|---|---|
| Server socket handlers | **16** | `grep -c "socket.on(" server.js` |
| Distinct client-emitted events | **28** | `grep -rho "emit('[a-z-]*'" src` |
| Client events with no server handler | **13** | set difference of the two above |
| Tracked `.md` files | **40** | `git ls-files '*.md' \| wc -l` |
| `TEST_REPORT_*.md` / `VERIFICATION_REPORT_*.md` | **11 / 4** | repo-wide |
| Tests | **0** | backend `test` script is the npm default failure stub |
| HTTP routes | **0** | `curl / → 404`, `curl /health → 404` |
| Loopback ping RTT (n=200) | **p50 0.25 ms · p95 0.41 ms · p99 0.62 ms** | `latency-ping` handler |
| Backend LOC | 1,056 (`server.js` 886 + `roles.js` 170) | `wc -l` |
| Frontend LOC | 6,330 across 30 files under `src/` | `wc -l` |

### Corrections to RESEARCH-CONTEXT.md / ENGINEERPROMPT.md

These documents are the audit; where measurement disagrees with them, measurement wins.
Recorded here rather than edited into those files, which are historical.

1. **"~18 socket handlers"** → there are exactly **16**.
2. **"`tsconfig.json` is dead config"** → there is **no `tsconfig.json` anywhere** in the
   repo. TypeScript 5.9 is an unused devDependency with no config file at all.
3. **"One `404` console error on load"** → cause identified: `index.html` declares no icon,
   so the browser's automatic `/favicon.ico` request 404s. Not an application error.
4. **The audit records two blockers (VIEWER role, ONLINE 0). There is a third**, and it is
   arguably worse: `cursor-move` is **never emitted by the application**. See Sprint 1.

---

## The root cause (proved, 2026-08-14)

The VIEWER-role blocker and the ONLINE(0) blocker are **one race condition**, not two bugs.

- `useSessionState`'s socket effect is gated on `sessionId` — `useSessionState.js:69`.
- `sessionId` is only set inside the `session-create` **ack** — `SessionManager.jsx:31-33`.
- The server emits `user-joined` at `server.js:361`, then invokes the ack at `server.js:380`.

The only message carrying `sessionMembers` and `users` is therefore broadcast while the
client has no listener attached. `userRole` falls back to `'viewer'` (`App.jsx:165`); `users`
stays `[]`, so `UserList.jsx:39` renders `Online (0)`.

Reproduced against the running server — an app-shaped client versus a control that registers
its listener before emitting:

```
--- APP-LIKE CLIENT (current code path) ---
ack carried session state : true
ack's role for creator    : creator        <-- the ack ALREADY has the right answer
user-joined received      : false
derived userRole          : viewer           <-- BLOCKER
derived ONLINE count      : 0                <-- BLOCKER

--- CONTROL: listener registered before emit ---
user-joined received      : true
derived userRole          : creator
derived ONLINE count      : 1
```

**Therefore the fix is not to re-broadcast harder.** The ack already carries correct state
and the client discards it. Seeding state from the ack removes the race by construction —
there is no ordering left to get wrong. This repro becomes the Sprint 5 regression test.

---

## Decisions

Recorded here because the aethereum MCP tools were registered mid-session and are not loaded
in this process. They push to the room on the next session; nothing is lost meanwhile.

### D1 — Persistence: Yjs + Hocuspocus (locked before this plan, in ENGINEERPROMPT)
One `Y.Doc` per board; a top-level `Y.Map` of elements; strokes as immutable point arrays
inserted once (never one CRDT op per point); `Y.Text` for text; cursors and presence via the
**Awareness protocol — ephemeral, never in the document**; `Y.UndoManager` scoped per user;
`y-indexeddb` for offline. Automerge 3 and Loro were assessed and rejected on ecosystem
breadth. tldraw is not a reference — it moved off Yjs.
**Why:** it solves persistence, conflict resolution and offline in one architectural move,
and it is what production whiteboards actually use.

### D2 — Yjs lands *before* feature completion (new, this plan)
The 13 orphaned events are all **document** state (layers, text formatting, templates, smart
shapes, video embeds). Implementing them on the socket model first and then migrating them
into the Y.Doc would write them twice.
**Why:** sequencing choice only — it changes no locked decision, it avoids duplicated work.
Consequence: Sprint 1 still proves the two-window journey on the *current* socket layer, per
MOTION.md's note that presence interpolation applies to the socket layer first.

### D3 — Amber, not green, marks live/connected (new, this plan)
`MOTION.md` says green appears exactly twice (connection dot, resolved-comment tick). The
locked SIGNAL system in `~/bruno-portfolio/CLAUDE.md` says amber is **the one accent** and
explicitly names "status dots" as an amber use.
**Why:** the portfolio file is the stated source of truth and supersedes; a second accent
colour would break the system everywhere else it is applied. Flagged rather than applied
silently, per the honesty rule that a contradiction must never be left ambiguous.

### D4 — The 13 orphaned events get real server handlers (Bruno, 2026-08-14)
Asked directly. Alternatives were deleting the dead UI or keeping it and dropping the claims.
**Why:** chosen so that every control in the product actually works, rather than shrinking
the product to match the backend.

### D5 — Free-tier hosting only (Bruno, 2026-08-14)
No spend. A free-tier backend may cold-sleep; the README will say so rather than claim
always-on.

### D6 — TypeScript devDependency removed (Bruno, 2026-08-14)
Adopting TS across 6,330 LOC would dwarf every other sprint. The repo becomes honestly a
JavaScript project.

### D7 — Owner-gated work is deferred to the very end (Bruno, 2026-08-14)
Anything needing Bruno — spend, force-push, publishing, external accounts — is collected in
Sprint 8. Sprints 0–7 require nothing from him.

---

## Sprint 0 — Honesty + hygiene ✅ CLOSED 2026-08-14

**Intent:** make the repo stop claiming things that are not true, and give it the metadata
of a real project. Nothing here touches the socket layer.

- [x] Delete the process docs. Keep `README.md`, `DEPLOYMENT.md`, `API.md`, the planning docs
      (`CLAUDE.md`, `MOTION.md`, `RESEARCH-CONTEXT.md`, `ENGINEERPROMPT.md`, `masterplan.md`)
      and the `AGENTS.md` + `GEMINI.md` that `aethereum init` created (**do not delete these
      two — they are live coordination config, not process artifacts**).
      → **35 files removed**, 40 tracked `.md` → 10.
- [x] Add MIT `LICENSE` (Bruno Jaamaa) — the README has carried an MIT badge with no licence.
- [x] Fix `collab-backend/package.json`: `main` → `server.js` (currently points at a
      nonexistent `index.js`), `license` → `MIT` (currently `ISC`, contradicting the README),
      fill `description` / `author` / `keywords`.
- [x] Remove the unused `typescript` devDependency from `collab-frontend/package.json` (D6).
- [x] Add a root `package.json` linking both subprojects with one install + one dev command.
      There is currently no root manifest and no workspace config at all.
      → npm workspaces + `npm-run-all`; `npm run dev` starts both.
- [x] Correct the boot banner at `server.js:885`. It currently headlines "Persistence" while
      all state is `const sessions = new Map()` at `server.js:30`.
      → now prints `[STATE] In-memory only — all sessions are lost on restart.`
- [x] Delete the auto-save interval at `server.js:369-376`. It logs
      `[AUTO-SAVE] Session … saved` and writes nothing — a log line that lies.
      → removed, along with the now-unused `sessionAutoSaveIntervals` map and its
      `clearInterval` branch in `deleteSession`.
- [x] Rename "AI shape completion" → **shape recognition** everywhere: `AICompletion.jsx` /
      `.css`, the `ai-shape-accept` event, the `aiGenerated` flag, and all doc references.
      It is 447 LOC of genuine geometric heuristics and is more impressive stated honestly.
- [x] Rewrite `README.md` to claim only what the code does, with a known-issues section
      naming the blockers until the sprints that fix them land.

**Gate:** both subprojects build clean · `git ls-files '*.md' | wc -l` ≤ 10 · no doc or log
line names a capability the code does not have · `git grep -i "ai shape\|aiGenerated"` empty.

**Verification (all passed, 2026-08-14):**
- `git ls-files '*.md' | wc -l` → **10**
- `git grep -i -e aiGenerated -e ai-shape -e AICompletion -- '*.js' '*.jsx' '*.css'` → empty
- `npm run build` (frontend) → 109 modules, 315.08 kB, **exit 0**
- `node --check server.js && node --check roles.js` → OK
- Backend boots and prints the corrected banner

**As-shipped delta:**
- **Rename went wider than planned.** Beyond the component and event, the permission
  constant `USE_AI_COMPLETION: 'ai:completion'` and the `'AI & Features'` permission group
  in `AdvancedPermissions.jsx` also carried the false framing. Now
  `USE_SHAPE_RECOGNITION: 'shapes:recognition'` and `'Shape recognition'`. Files renamed
  `AICompletion.{jsx,css}` → `ShapeRecognition.{jsx,css}` via `git mv` so history follows.
- **Two extra honesty findings, not in the plan**, both fixed:
  1. `API.md` documents `tool-change`/`tool-changed` as working. **No server handler exists.**
     Flagged inline as `⚠️ NOT IMPLEMENTED` and a header note lists the 7 implemented events
     the file omits and the 12 further orphaned ones.
  2. `DEPLOYMENT.md` gives instructions for `VITE_SOCKET_URL`, `GET /health` and Supabase
     persistence — **none of which exist**. Header banner added marking it a target rather
     than instructions, with each false premise named. Full rewrite stays in Sprint 6.
- **`collab-backend/ROLES.md` and `TROUBLESHOOTING.md` were deleted** along with the process
  docs. ROLES.md was genuine reference rather than a process artifact; its content is
  superseded by the formal role/permission contract due in Sprint 3, which is where it
  belongs. Noted so the loss is deliberate and traceable, not accidental.
- Backend `test` script changed from the npm default `exit 1` stub to an honest
  `exit 0` with a pointer to Sprint 5, so the root `npm test` is not red for a reason that
  isn't a test failure.

**Deferred:**
- Full `DEPLOYMENT.md` rewrite → Sprint 6 (owns env-parameterisation; rewriting it before
  the code exists would just move the fiction).
- Full `API.md` rewrite → Sprint 3 (`declare_contract` produces the authoritative schema).

---

## Sprint 1 — Make the core journey work ✅ CLOSED 2026-08-14

**Intent:** two browser windows, one board, both people drawing and seeing each other. This
is the entire product and none of it currently works. Still on the socket layer — Yjs comes
next, and this sprint's gate is what proves the migration didn't regress anything.

- [x] **Seed session state from the ack.** `SessionManager` currently keeps only
      `response.sessionId` and discards `response.session`, which already contains the
      correct `sessionMembers`, `users` and full board state. Thread it through
      `onSessionJoin` → `App` → `useSessionState` as an initial snapshot. Kills the race by
      construction rather than by ordering luck. Applies to `session-join` identically.
- [x] **Emit `cursor-move`.** `moveCursor` (`useSessionState.js:354`) is called by nothing;
      `cursor-move` is never sent by the application. Wire it into `Canvas`'s
      `handleMouseMove` throttled to ~30 Hz — the scaffolding is already there
      (`lastCursorEmitRef`, `CURSOR_THROTTLE_MS = 33`, `Canvas.jsx:86-87`) and is currently
      spent on `camera-change` only. Use a separate throttle ref so cursor and camera don't
      starve each other.
- [x] **Stop the listener stomping.** `useSessionState` makes 26 bare `socket.off(evt)` calls
      (lines 72-99 and 298-325). Bare `.off(event)` removes *every* handler for that event,
      including `CursorPresence`'s own `cursor-update` listener (`CursorPresence.jsx:24`).
      Child effects run before parent effects, so `useSessionState` wins and kills it.
      Convert all of them to named handlers with `socket.off(evt, handler)`.
- [x] **Make `CursorPresence` a pure renderer** of `sessionState.cursors` instead of owning a
      competing listener. Also fixes its effect re-running every render (`easeOutQuad` is
      redeclared inline each render and sits in its dep array, `CursorPresence.jsx:61`).
- [x] **Fix the user-shape mismatch.** The server sends `users` as an array of socket-id
      **strings**; `App.jsx:156` and `App.jsx:269` both treat entries as objects and read
      `.id`. `UserList.jsx` treats them correctly as strings — align on strings.
- [x] **Make undo/redo mutate content.** `Session.undo()` (`server.js:118`) only decrements
      `historyIndex`; it never touches `session.strokes`, and the broadcast carries only
      `operationIndex`, which the client assigns straight to state (`useSessionState.js:183`).
      Ctrl+Z currently changes a number and no ink disappears. Apply/revert the recorded
      operation and broadcast the resulting element set.
- [x] Add a favicon to `collab-frontend/index.html` — removes the `404` on load.

**Gate (evidence required, per CLAUDE.md):** two browser windows on one board, recorded —
creator can draw · both cursors move live · `ONLINE (2)` · a stroke drawn in window A appears
in window B · Ctrl+Z removes it in **both** · zero console errors. Plus the scripted repro
above now reporting `creator` / `1`.

**Verification — PASSED 2026-08-14.** Two independent harnesses, both green.

*Protocol level* (scripted socket clients, `sprint1-protocol.cjs`) — **14/14**:
creator role from the ack · presence counts the creator · joiner defaults to viewer · joiner
sees both users · creator notified of the join · creator keeps its role after a join · cursor
from A reaches B · creator can draw · stroke reaches B · **viewer is refused** · undo
broadcasts a rebuilt element set · undo removes the stroke · B sees the removal · redo
restores it.

*Browser level* (Playwright, two real Chromium windows, `two-window.cjs`) — **15/15**:
role badge reads `creator` · no View Only overlay for the creator · `ONLINE (1)` → `ONLINE (2)`
in both windows · session id readable in full · joiner badge reads `viewer` · A's stroke
renders on B (960 non-background pixels) · remote cursor rendered and positioned by
`transform` · Ctrl+Z clears the ink in **both** windows (0 pixels remain) · **no console
errors in either window** · **no failed network requests** (the `404` is gone).
Screenshots of both windows captured.

**As-shipped delta:**
- **Two further blockers found while building, both fixed:**
  1. **The session id was truncated in the only place it is displayed** —
     `sessionId?.slice(0, 10)…` against a 13-character id. A user could not read their own
     session id, so **nobody could ever join a board**. Two-window collaboration was
     impossible through the UI even with the role bug fixed. Now shown in full, selectable,
     with a copy button.
  2. **Canvas coordinates were desynchronised from the pointer.** The bitmap was sized
     `window.innerWidth - 200` while CSS gave the element `flex: 1` plus `margin: 24px` and
     `padding: 24px` — so the bitmap was scaled to a different size than it was drawn at and
     every stroke landed offset from the cursor. The bitmap is now sized from the element's
     own `getBoundingClientRect()`, and the box-model insets moved off the canvas.
- **Cursors are broadcast in canvas space, not screen space** (a design call, not in the
  plan). A remote cursor now stays attached to board content when either side pans or zooms.
  `CursorPresence` converts to viewport space using the live canvas rect and the local camera.
- **Cursor and camera throttles were separated.** They shared `lastCursorEmitRef`, so panning
  starved cursor broadcasts and vice versa.
- **`undo()`'s guard was off by one.** It read `historyIndex > 0`, which made the *first*
  operation on a board permanently un-undoable. Now `>= 0`, so undoing back to an empty board
  works. Undo is implemented by replaying `history[0..historyIndex]` — the log is already a
  complete ordered record and is capped at 100 entries, so the replay is bounded.
- **A latent crash was guarded**: `cursor-move` wrote to `session.userPresence[userId].cursor`
  unconditionally, which throws if the user was removed from the session first (reconnect
  races).
- Cursor emission was deliberately placed **above** the `canDraw` gate: a viewer's cursor
  must still be visible to others. Presence is not a drawing permission.

**Deferred:**
- Cursor interpolation (MOTION.md's 80 ms buffered, time-based easing), name chips, join
  rings and idle fades → **Sprint 4**, which owns motion. Sprint 1 renders cursors correctly
  but without smoothing.
- **New layout finding for Sprint 4:** in the creator's window the session-info block is
  pushed below the fold by the extra creator-only panel buttons — so the person who most
  needs to share the session id has to scroll to reach it. Confirmed in the captured
  screenshot. Fix with the rest of the panel-overlap work.

---

## Sprint 2 — Persistence: Yjs + Hocuspocus (D1) ✅ CLOSED 2026-08-14

**Intent:** close the single biggest credibility gap. Right now persistence is not merely
absent — it is structurally impossible: sessions are **deleted when the last user leaves**
(`server.js:867`).

- [x] Stand up `@hocuspocus/server` 4.x (Node 22+) with SQLite persistence via
      `better-sqlite3`. Verify the current major at implementation time, not from memory.
- [x] Model the document: top-level `Y.Map` of elements; strokes as **immutable point arrays
      inserted once**, never one CRDT op per point; `Y.Text` for text bodies.
- [x] Move cursors, camera and presence to the **Awareness protocol** — ephemeral, never in
      the document. Keep the existing socket events for anything Awareness doesn't cover.
- [x] `Y.UndoManager` scoped per user, replacing the server-side history array.
- [x] `y-indexeddb` on the client for offline.
- [x] Delete the delete-on-empty branch (`server.js:867`) — it is the direct opposite of
      persistence.
- [x] Keep the role/permission model authoritative on the server; a CRDT does not enforce
      permissions.

**Gate:** kill the server mid-session, restart it, reload both windows — the board is still
there · two windows converge after concurrent edits · a client edits offline and reconciles
on reconnect · Sprint 1's two-window gate still passes.

**Verification — PASSED 2026-08-14.** Three harnesses, 33 checks, all green.

*Persistence* (`persistence.cjs`, real browsers, real process kill) — **9/9**:
draw 1,670 px of ink → `pkill` the server, confirm `/health` is unreachable → start a NEW
process → **1,670 px restored exactly**, in a browser profile with an empty IndexedDB, so it
can only have come from the server's SQLite. Session metadata survived. A returning browser
keeps its stored role (`creator`); an unknown browser gets `viewer`.

*CRDT permission boundary* (`crdt-permissions.cjs`, no UI at all) — **9/9**. This is the
property a CRDT makes easy to get wrong: every connected client holds a writable handle on
the shared type, so hiding the toolbar from viewers is decoration. Driving the wire protocol
directly with a **valid viewer token**: the viewer can open and read the document, and its
write is **rejected server-side** — the observer re-reading from the server sees only
`legit-stroke`. Both token forgeries are refused with `permission-denied`: a token for a
non-member, and a genuine token minted for a *different* board.

*Sprint 1 regression* (`two-window.cjs`) — **15/15**, unchanged on the new stack.

**As-shipped delta:**
- **A blocker found by the gate itself: membership was keyed by `socket.id`.** Socket ids are
  minted fresh on every connection, so persisted roles could never actually be reclaimed —
  a creator reloading the page came back to their own board as a viewer, with no way to
  regain control. Added a stable per-browser client id (`collab/identity.js`, localStorage)
  and keyed membership on it. The persistence of roles was meaningless without this.
- **Hocuspocus 4 runs on `crossws`, and `handleConnection` does not subscribe to the socket.**
  Its own server pumps frames in via `peer._hocuspocus.handleMessage(...)`. Hosting it on a
  plain `ws` server means forwarding `message` and `close` by hand, and passing a Fetch-style
  request whose `headers` is a real `Headers`. Without that the WebSocket opens, the client
  reports `connected`, and **nothing ever syncs — with no error at all**. Cost an hour;
  documented at the mount so nobody pays it twice.
- **Both transports share one HTTP server and one port.** socket.io and Hocuspocus each get
  an `upgrade` listener; the Yjs one returns silently for paths it does not own rather than
  destroying the socket, which would kill every socket.io connection. One process matters:
  free-tier hosting gives you exactly one.
- **`GET /health` and `GET /` shipped early** (they were Sprint 6 items). The server had zero
  HTTP routes, and a health endpoint was the only way to assert "a NEW process is serving"
  in the restart test. `/health` reports uptime, session count, live document count and
  connection count.
- **Undo is now per-user**, via a `Y.UndoManager` scoped to this client's transaction origin.
  A behaviour change and an improvement: the old shared server-side stack meant Ctrl+Z could
  remove a stroke somebody else had just drawn.
- **Comments moved into the document**, so they persist with the board instead of evaporating
  with the old in-memory session.
- Text bodies are `Y.Text` and are updated by **diffing** rather than clear-and-rewrite, so
  two people editing one text box merge instead of clobbering each other.
- Strokes are inserted as **one operation per stroke**, never one per point — the naive
  version produces thousands of ops per minute of drawing and the document can never be
  compacted.
- Panels whose events still have no server handler (Templates, Smart Shapes, Layers, Text
  Formatting, Video, Advanced Permissions) are **hidden behind `SPRINT3_FEATURES_READY`**
  rather than left on screen as controls that silently do nothing.

**Deferred:**
- **Offline edit-and-reconcile is not yet proven.** `y-indexeddb` is wired and the board
  hydrates from cache before the network answers, but the gate's "edit offline, reconcile on
  reconnect" clause was verified only as far as offline *read*. Writing while disconnected and
  asserting convergence needs a network-interception harness → **Sprint 5**, with the tests.
  Called out rather than quietly ticked.
- Synchronised camera ("follow me") — the camera rides Awareness but no UI drives it → Sprint 3.
- The activity feed is still ephemeral and is not claimed as persistent anywhere.

---

## Sprint 3 — Feature completion (D4)

**Intent:** no emitter without a receiver. Thirteen client events currently emit into the
void, which is why Templates, Smart Shapes, Layers, Text Formatting and Video Embed do
nothing at all.

Document state, built on the Y.Doc from Sprint 2:
- [ ] `layer-create` · `layer-update` · `layer-delete` · `layer-order-change`
- [ ] `text-formatting-update`
- [ ] `template-load`
- [ ] `smart-shape-place`
- [ ] `shape-recognition-accept` (renamed from `ai-shape-accept` in Sprint 0)
- [ ] `video-embed` · `video-embed-move` · `video-embed-remove`

Ephemeral / control, staying on sockets:
- [ ] `tool-change`
- [ ] `permission-change`

- [ ] Permission check and activity-log entry on every mutating path, matching the existing
      `canPerformAction` pattern in `roles.js`.
- [ ] **`declare_contract`**: publish the complete socket event schema and the role/permission
      model — required by CLAUDE.md for every interface other code consumes.

**Gate:** every control in the UI round-triggers to a second window · the emitted-events set
minus the handled-events set is empty · no permission bypass on any new path.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_

---

## Sprint 4 — SIGNAL + MOTION

**Intent:** the UI currently reads as unfinished because it is unstyled, not because it is
badly designed. Apply the inherited system; invent nothing. `MOTION.md` is binding and its
acceptance checklist is folded into this gate.

Design (SIGNAL — `~/bruno-portfolio/CLAUDE.md`):
- [ ] Palette: `--bg #050505` · `--surface #0b0a09` · `--text-primary #f0ece4` ·
      `--text-secondary #98928a` · `--text-dim #55504a` · `--amber #ffb000` ·
      `--steel #2c2925` · `--hairline #1b1916`. No light theme, no gradients, no shadows.
- [ ] Canvas paints warm black, not `#ffffff` (`Canvas.jsx:212`).
- [ ] Replace **every** emoji with monospace glyphs or labelled brackets: toolbar
      `✏️📏▭⭕📝💾🔍`, role badges `👑✏️👁️`, the `👁️ View Only Mode` overlay, and the
      `📋💬👥📚🗂️🔷🎬🔐` sidebar toggles.
- [ ] Replace the invented palette in `UserList.jsx:15` / `CursorPresence.jsx:64`
      (`#ff6b6b #4ecdc4 #ffa502 #a8e6cf`) with grayscale + amber per-user differentiation.
- [ ] Border-radius ≤ 2px everywhere.
- [ ] Fix the overlapping panels: Exit Session over the toolbar, latency widget over the
      ONLINE panel.

Motion (`MOTION.md`):
- [ ] Remote cursors: ~80 ms buffer, exponential smoothing, **time-based** so it is identical
      at 60 Hz and 144 Hz. Transform only, in the render loop — never `transition: left/top`.
- [ ] Name chip trails 12px, fades to 40% after 2s idle; cursor dims to 25% after 30s.
- [ ] Join: scale 0→1 over 200ms + one expanding 1px ring + `> name joined` in the feed.
      Leave: fade to 0 over 400ms. No modal, no toast — presence is ambient.
- [ ] Remote strokes draw **progressively** as points stream, same 80 ms buffer, then a final
      reconciliation pass to the canonical path (verify by diffing).
- [ ] **Own ink renders with zero added latency** — no smoothing, no buffering. Non-negotiable.
- [ ] Undo/redo: affected element flashes to 50% and back over 240ms; actor named in the feed.
- [ ] Shape recognition: raw stroke cross-fades into the clean shape over 250ms with 100ms
      overlap; `> looks like a rectangle — keep?` chip for 3s, ignoring it keeps the result.
- [ ] Comments: pins scale in 200ms; unresolved pin carries the 2s pulse; resolve collapses
      the thread over 280ms.
- [ ] Role change: name chip cross-fades to the new badge; if it is *your* role, one toast
      slides down — `> you can now edit`.
- [ ] Connection: amber dot solid when live (D3); hollow + pulse while `> reconnecting...`
      types; on reconnect, missed ops replay **batched over ≤800ms**, never one-by-one.
- [ ] Latency meter counts between values, updates at most twice per second.
- [ ] `prefers-reduced-motion`: cursors snap, no halos, no pulses, everything still
      attributable via the activity feed. Nothing flashes >3×/s.

**Gate:** MOTION.md's full acceptance checklist, including the 60 Hz/144 Hz equivalence
check, the kill-the-server-mid-draw recording, and the blind test distinguishing a remote
undo flash from a deletion.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_

---

## Sprint 5 — Tests + CI

**Intent:** close the 15-test-reports-against-zero-tests gap, starting with the pure logic
where the value per line is highest.

- [ ] Vitest over `collab-frontend/src/utils/permissions.js` (388 LOC of pure role logic).
- [ ] Vitest over `collab-backend/roles.js` (170 LOC — the permission matrix).
- [ ] Vitest over `collab-frontend/src/utils/shapeRecognition.js` (447 LOC of geometry).
- [ ] **The race regression test.** Promote the Sprint 1 repro into an integration test that
      drives a real socket client the way the app does and asserts `creator` / `ONLINE 1`.
      It must fail against pre-Sprint-1 code — verify that, or it proves nothing.
- [ ] Replace the backend `test` script, which currently fails by construction.
- [ ] GitHub Actions on push: install, build both, test both.

**Gate:** `npm test` passes and is meaningful · the race test demonstrably fails on the old
code · CI green.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_

---

## Sprint 6 — Deploy readiness (no spend)

**Intent:** make it deployable anywhere. Everything short of the button that needs Bruno.

- [ ] `VITE_SOCKET_URL` replacing the hardcoded literal at `App.jsx:44` and the default at
      `useSocket.js:11`. A deployed frontend currently tries to reach the *visitor's own*
      localhost.
- [ ] `CORS_ORIGIN` env var replacing the hardcoded array at `server.js:15`.
- [ ] `GET /health` — there are currently zero HTTP routes, and every host's health check
      requires one. (`server.js:23` already reads `process.env.PORT` correctly.)
- [ ] `.env.example` on both sides.
- [ ] `Dockerfile` + `fly.toml` for the backend; `vercel.json` for the frontend.
- [ ] Rewrite `DEPLOYMENT.md` against what actually exists, noting that serverless cannot
      host WebSockets and that a free-tier backend may cold-sleep (D5).

**Gate:** the frontend runs against a backend on a non-localhost host purely by changing env
vars — verified on the LAN, no code edit.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_

---

## Sprint 7 — The demo + verified claims

**Intent:** nothing currently in the repo communicates what this is. For a collaborative
whiteboard the demo *is* the marketing.

- [ ] Storyboard the two-window GIF per MOTION.md's shot list: join ring → live cursors →
      progressive stroke → shape snap → resolved comment. Then record it.
- [ ] Put it at the top of the README.
- [ ] Publish measured latency with its method stated (n, percentiles, loopback vs network).
      Loopback p50 is 0.25 ms; that is not the number to publish as "sync latency".
- [ ] Every remaining README number traceable to a committed artifact.

**Gate:** each claim in the README maps to an artifact in the repo · the GIF shows the five
beats above.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_

---

## Sprint 8 — Owner-gated (D7 — deferred to the very end)

Each item stops for `ask_human` before acting. None of Sprints 0–7 depends on any of it.

- [ ] Deploy: frontend to Vercel, backend to Fly/Railway free tier. Needs Bruno's accounts.
- [ ] Measure **deployed** p50/p95 cross-network and update the README with real numbers —
      this is the only measurement that can honestly back a "sync latency" claim.
- [ ] `git filter-repo` author rewrite: "Subagent <agent@openclaw>" → Bruno, keeping history.
      Then force-push. Irreversible on a public repo — explicit go-ahead required.
- [ ] Update the portfolio copy to match measured reality, replacing the unverified
      "50–80 ms sync" line.

**Gate:** two people on different machines open a URL and draw together, and the state
survives a server restart. That is the bar set in ENGINEERPROMPT.md.

**As-shipped delta:** _(fill at close)_
**Deferred:** _(fill at close)_
