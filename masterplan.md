# masterplan.md — COLLAB DASHBOARD

**Source of truth for sequencing.** `CLAUDE.md` is the source of truth for rules; `MOTION.md`
is binding for animation. Precedence on conflict: masterplan (sequencing) > CLAUDE.md (rules)
> ENGINEERPROMPT.md (kickoff).

Status keys: `[ ]` not started · `[~]` in progress · `[x]` complete · `[⏭]` deferred (always
with a one-line reason).

**Rule:** never delete or rewrite content in this file. Expand it in place — add sub-tasks,
file paths, edge cases, findings. Deepen, don't replace.

**Current sprint pointer:** → ALL SPRINTS CLOSED (0–8, 2026-08-14). The work remaining in
Sprint 8 is owner-executed by Bruno's own decision and is marked `[⏭]` with its reason.

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

## Sprint 3 — Feature completion (D4) ✅ CLOSED 2026-08-14

**Intent:** no emitter without a receiver. Thirteen client events currently emit into the
void, which is why Templates, Smart Shapes, Layers, Text Formatting and Video Embed do
nothing at all.

Document state, built on the Y.Doc from Sprint 2:
- [x] `layer-create` · `layer-update` · `layer-delete` · `layer-order-change`
- [x] `text-formatting-update`
- [x] `template-load`
- [x] `smart-shape-place`
- [x] `shape-recognition-accept` (renamed from `ai-shape-accept` in Sprint 0)
- [x] `video-embed` · `video-embed-move` · `video-embed-remove`

Ephemeral / control, staying on sockets:
- [x] `tool-change`
- [x] `permission-change`

- [x] Permission check and activity-log entry on every mutating path, matching the existing
      `canPerformAction` pattern in `roles.js`.
- [x] **`declare_contract`**: publish the complete socket event schema and the role/permission
      model — required by CLAUDE.md for every interface other code consumes.

**Gate:** every control in the UI round-triggers to a second window · the emitted-events set
minus the handled-events set is empty · no permission bypass on any new path.

**Verification — PASSED 2026-08-14.** 44 checks across four harnesses, all green.

*Feature round-trip* (`features.cjs`, two real browsers) — **11/11**. Every previously-dead
control driven through the real UI in window A and asserted in window B, which learns about it
only over the wire: role change (viewer → editor, including the document reconnect) · layers
(A=2 rows, B=2 rows) · templates (B ink 0 → 5,941 px) · smart shapes (5,941 → 6,901 px) ·
text creation (B holds 7 elements) · **text formatting** (7,359 → 7,467 px) · video embed
(1 embed rendered in B) · tool selection (visible as a glyph in B) · **zero console errors in
either window**.

*Orphan audit* — the emitted-events set minus the handled-events set is **empty**:
```
client emits : latency-ping permission-change role-change session-create session-join
server handles: can-i disconnect latency-ping permission-change role-change
                session-create session-join tool-change
ORPHANED: 0
```

*Regressions* — Sprint 1 two-window **15/15**, Sprint 2 persistence **9/9**, CRDT
permissions **9/9**, all still green after this sprint's changes.

**As-shipped delta:**
- **A layout bug found by the gate, and it was a correctness bug, not cosmetics.** The canvas
  measured **1440 px wide inside a ~870 px visible area** — flex items default to
  `min-width: auto` and refuse to shrink below their content, so `.canvas-container`
  overflowed its row. Everything past the fold was still drawable but permanently off-screen:
  **you could draw where you could not see, and clicks there hit the sidebar instead.**
  Fixed with `min-width: 0`. This is why smart-shape placement appeared not to work.
- **An id-shadowing bug in the document read path.** `readElements` returned
  `{ id, ...value }`, so a stored `id` field overrode the authoritative Map key. Video embeds
  came back with `id: undefined` — React reported duplicate keys, and move/remove by id could
  never have worked. The Map key is now applied last, and `addVideoEmbed` no longer stores an
  `id` inside the value.
- **`TextFormattingToolbar`'s JSDoc contradicts its own implementation.** The documented props
  (`isBold`, `onBoldToggle`, `onFontSizeChange`, …) do not exist; the real signature is
  `(isVisible, selectedTextId, onFormatChange, currentFormatting)`. Wired to the code, not the
  comment, and the discrepancy noted at the call site.
- **`tool-change` was going to be a handler with no caller** — the mirror image of the
  original problem. Rather than ship a dead handler in the other direction, tool selection is
  now broadcast and **rendered**: each collaborator's current tool appears as a monospace
  glyph beside their name in the user list.
- **Templates are additive.** The previous implementation replaced the canvas outright, which
  on a shared board would silently delete everyone else's work. A template now loads inside
  **one transaction**, so collaborators never see a half-built diagram and a single Ctrl+Z
  undoes the whole load.
- **Deleting a layer deletes its elements.** Orphaning them would leave ink on the board that
  no layer control can reach — invisible to the panel, still rendered, impossible to remove.
- `data-doc-elements` / `data-doc-layers` added to the status block as testability
  affordances, alongside the existing `data-doc-status` / `data-doc-synced`.
- `API.md` rewritten as the authoritative contract (the `declare_contract` deliverable):
  both protocols, the element schema, the five modelling rules, the token scheme and the
  permission boundary.

**Deferred:**
- **Connectors between template shapes are not drawn.** `createCanvasFromTemplate` returns an
  `initialConnectors` array; the shapes render, the arrows between them do not. Flowchart
  templates therefore load as unconnected boxes. Not claimed anywhere as working → **Sprint 4**,
  which owns rendering.
- Synchronised camera / "follow me" — the camera rides Awareness and peers publish it, but no
  UI consumes it → Sprint 4.
- `ExportDialog` is still unwired (PNG/SVG/JSON export). It was not in the orphaned-event set
  because it never emitted anything — it is a local-only dialog → Sprint 4.

---

## Sprint 4 — SIGNAL + MOTION ✅ CLOSED 2026-08-14

**Intent:** the UI currently reads as unfinished because it is unstyled, not because it is
badly designed. Apply the inherited system; invent nothing. `MOTION.md` is binding and its
acceptance checklist is folded into this gate.

Design (SIGNAL — `~/bruno-portfolio/CLAUDE.md`):
- [x] Palette: `--bg #050505` · `--surface #0b0a09` · `--text-primary #f0ece4` ·
      `--text-secondary #98928a` · `--text-dim #55504a` · `--amber #ffb000` ·
      `--steel #2c2925` · `--hairline #1b1916`. No light theme, no gradients, no shadows.
- [x] Canvas paints warm black, not `#ffffff` (`Canvas.jsx:212`).
- [x] Replace **every** emoji with monospace glyphs or labelled brackets: toolbar
      `✏️📏▭⭕📝💾🔍`, role badges `👑✏️👁️`, the `👁️ View Only Mode` overlay, and the
      `📋💬👥📚🗂️🔷🎬🔐` sidebar toggles.
- [x] Replace the invented palette in `UserList.jsx:15` / `CursorPresence.jsx:64`
      (`#ff6b6b #4ecdc4 #ffa502 #a8e6cf`) with grayscale + amber per-user differentiation.
- [x] Border-radius ≤ 2px everywhere.
- [x] Fix the overlapping panels: Exit Session over the toolbar, latency widget over the
      ONLINE panel.

Motion (`MOTION.md`):
- [x] Remote cursors: ~80 ms buffer, exponential smoothing, **time-based** so it is identical
      at 60 Hz and 144 Hz. Transform only, in the render loop — never `transition: left/top`.
- [x] Name chip trails 12px, fades to 40% after 2s idle; cursor dims to 25% after 30s.
- [x] Join: scale 0→1 over 200ms + one expanding 1px ring + `> name joined` in the feed.
      Leave: fade to 0 over 400ms. No modal, no toast — presence is ambient.
- [x] Remote strokes draw **progressively** as points stream, same 80 ms buffer, then a final
      reconciliation pass to the canonical path (verify by diffing).
- [x] **Own ink renders with zero added latency** — no smoothing, no buffering. Non-negotiable.
- [x] Undo/redo: affected element flashes to 50% and back over 240ms; actor named in the feed.
- [x] Shape recognition: raw stroke cross-fades into the clean shape over 250ms with 100ms
      overlap; `> looks like a rectangle — keep?` chip for 3s, ignoring it keeps the result.
- [x] Comments: pins scale in 200ms; unresolved pin carries the 2s pulse; resolve collapses
      the thread over 280ms.
- [x] Role change: name chip cross-fades to the new badge; if it is *your* role, one toast
      slides down — `> you can now edit`.
- [x] Connection: amber dot solid when live (D3); hollow + pulse while `> reconnecting...`
      types; on reconnect, missed ops replay **batched over ≤800ms**, never one-by-one.
- [x] Latency meter counts between values, updates at most twice per second.
- [x] `prefers-reduced-motion`: cursors snap, no halos, no pulses, everything still
      attributable via the activity feed. Nothing flashes >3×/s.

**Gate:** MOTION.md's full acceptance checklist, including the 60 Hz/144 Hz equivalence
check, the kill-the-server-mid-draw recording, and the blind test distinguishing a remote
undo flash from a deletion.

**Verification — PASSED 2026-08-14.** 56 checks across five harnesses, all green.

*Motion + design* (`motion.cjs`) — **12/12**:
palette is grayscale + amber only (every computed `color` / `background` / `border` in the
live DOM, no exceptions) · no emoji in any rendered text node · border-radius ≤ 2px
everywhere · remote cursor animates across **72 distinct positions in 85 frames** (a
teleporting cursor gives a handful) · largest single frame step is **13.4 px of 438 px**
total travel · easing converges in the same time at 30/60/144 Hz (383 / 375 / 400 ms) ·
cursor carries a name chip · **remote stroke draws progressively** (424 px visible on the
other screen *while the pen was still down*) and reconciles to the canonical path
(424 → 784 px) · **own ink paints before any document write** · reduced motion snaps the
cursor (0 interpolated frames) and loops no animation.

*Regressions* — features 11/11, two-window 15/15, persistence 9/9, CRDT permissions 9/9.

**As-shipped delta:**
- **The design system now lives in one file.** `styles/signal.css` replaces **4,468 lines
  across 24 per-component stylesheets** — white surfaces, 8px radii, soft shadows and an
  ad-hoc palette of `#ff6b6b` / `#4ecdc4` / `#ffa502`. A system that lives in 24 files is not
  a system. Bundle CSS dropped 54 kB → 22 kB.
- **Progressive remote strokes are streamed over Awareness, not the document.** MOTION.md
  wants the other person's line to *draw*; the document model requires one operation per
  finished stroke. Both hold: the in-progress point array is published as ephemeral Awareness
  state on the same 30 Hz tick as the cursor (so the pen and its line stay attached), and the
  canonical stroke is committed to the Y.Doc on pointer-up. The preview is dropped *after*
  the commit, so the reconciliation has no visible gap.
- **The canvas 2D bitmap was still painted `#ffffff`.** Restyling the CSS does not touch the
  canvas fill — the board looked white through the entire design pass until this was found.
  Board and default ink are now warm black and warm white.
- **Overlay lanes.** Every floating readout had been positioned into the same corner, which
  is what produced the original "Exit Session over the toolbar" and "latency widget over the
  ONLINE panel". Each overlay now owns a lane, the latency readout is `pointer-events: none`
  (it was swallowing clicks aimed at the board), and the toast stack moved off the
  bottom-centre lane the recognition chip owns.
- **Ignoring the recognition chip now KEEPS the recognition**, per MOTION.md. Ignoring is the
  common case, so ignoring is the cheap one: after 3 s the clean shape is committed, and
  dismissing is the deliberate act that keeps the rough stroke.
- **Deferred Sprint 3 items all cleared**: template connectors are drawn (with arrowheads
  inset to the target box, and labels), and `ExportDialog` is wired to a toolbar control.
- `LatencyMeter` had a listener leak — `socket.on('latency-pong', …)` inside an effect that
  never removed it, so every re-run added another handler. Rewritten with named handlers, and
  the readout now counts toward the measured value at ≤2 updates/second per MOTION.md.
- The join-row button was starving its input (`.btn` is `width: 100%` for the primary action);
  the session-id block is no longer pushed below the fold in the creator's window.

**Deferred:**
- **The 60/144 Hz check verifies the formula, not the running component.** It reimplements
  the exact easing used (`alpha = 1 - exp(-dt / TAU)`) and proves convergence is time-based;
  the *component* is proven to animate smoothly by the 85-frame glide sample. Measuring the
  live component under CPU throttling would close the small gap. Stated rather than
  overclaimed.
- **The undo flash and comment pins are implemented but not asserted by an automated check.**
  MOTION.md's "blind test distinguishing a remote undo flash from deletion" is by
  construction a human test → carried to Sprint 7 with the demo recording.
- **Reconnect replay batching (`> back — syncing 4 changes`) is not implemented.** Yjs
  reconciles the whole document on reconnect in a single update, so there is no per-operation
  replay to batch — the spec's concern (a 200-op replay animated one by one) cannot arise.
  Recorded as *not applicable under the CRDT*, not as done.
- Synchronised camera / "follow me" — peers publish camera over Awareness and nothing
  consumes it. No UI affordance exists → left open rather than half-built.

---

## Sprint 5 — Tests + CI ✅ CLOSED 2026-08-14

**Intent:** close the 15-test-reports-against-zero-tests gap, starting with the pure logic
where the value per line is highest.

- [x] Vitest over `collab-frontend/src/utils/permissions.js` (388 LOC of pure role logic).
- [x] Vitest over `collab-backend/roles.js` (170 LOC — the permission matrix).
- [x] Vitest over `collab-frontend/src/utils/shapeRecognition.js` (447 LOC of geometry).
- [x] **The race regression test.** Promote the Sprint 1 repro into an integration test that
      drives a real socket client the way the app does and asserts `creator` / `ONLINE 1`.
      It must fail against pre-Sprint-1 code — verify that, or it proves nothing.
- [x] Replace the backend `test` script, which currently fails by construction.
- [x] GitHub Actions on push: install, build both, test both.

**Gate:** `npm test` passes and is meaningful · the race test demonstrably fails on the old
code · CI green.

**Verification — PASSED 2026-08-14. 95 unit + integration tests, plus 65 e2e checks.**

```
collab-backend   roles.test.mjs                 13
                 store.test.mjs                  9
                 session.integration.test.mjs   10   ← the race regression
collab-frontend  permissions.test.js            20
                 shapeRecognition.test.js       18
                 doc.test.js                    25   ← the CRDT modelling rules
                 ─────────────────────────────────
                                                95   all passing
```

e2e gates, all green and re-run three times for stability: two-window 15/15 · persistence
9/9 · CRDT permissions 9/9 · features 11/11 · motion 12/12 · **offline 8/8**.

**THE TESTS FOUND SIX REAL BUGS.** That is the argument for having written them:

1. **`addStroke` never stored `layerId`.** Strokes belonged to no layer, so hiding a layer
   left them visible and deleting one left them orphaned on the board — reachable by no
   control. Layers had *looked* like they worked because the panel updated.
2. **Corner detection was inverted.** `getAngle` returns the angle *between* the two vectors
   meeting at a point, so a perfectly straight run scores 180° — and the check was
   `abs(angle) > 25`. Every point on every straight edge counted as a corner: a 48-point
   rectangle reported **46 corners**. Since `tryRectangle` accepts only 3–5, **rectangle,
   triangle and diamond recognition could never fire on a real stroke.**
3. **Corner detection was not cyclic**, so a closed shape lost the corner it started on —
   a rectangle came back with 3 corners and fell into the triangle detector.
4. **`tryCircle` had no roundness test.** It checked closure, convexity and aspect ratio, all
   of which a rectangle satisfies. Cleanly drawn rectangles were recognised as circles.
5. **The corner-count gates overlapped** (rectangle 3–5, triangle 2–4, diamond 3–5), so all
   three fired on the same stroke and a flat confidence constant picked the winner. Rectangle
   and diamond now discriminate on *where* the corners sit: box corners versus edge midpoints.
6. **Accepting a shape recognition ADDED a clean shape without removing the rough stroke**,
   leaving both perfectly overlapped — so a recognised drawing silently doubled its element
   count and an undo removed only half of what the user could see. MOTION.md describes the
   stroke *becoming* the shape; it now does.

And fixing (6) exposed a seventh: **a recognised line, triangle, diamond or arrow rendered
nothing at all.** They are stored with `bounds` and no points, and the renderer only handled
bounds for rectangles and circles. The raw stroke had been masking it. Accepting a line
recognition therefore erased your stroke and drew empty space — caught only because the
persistence gate started failing on a board that should have been restored.

**As-shipped delta:**
- **The offline clause deferred from Sprint 2 is now closed properly** (`offline.cjs`): A is
  taken offline at the network level, keeps drawing, B draws concurrently, A returns — and
  **both boards converge on all four elements with nothing clobbered**. A last-write-wins
  system loses one side here; this is the whole reason for choosing a CRDT.
- **A scope limit found and stated rather than glossed:** `y-indexeddb` caches the
  *document*, not the application shell. There is no service worker, so reloading the page
  while offline fails at the network — the HTML cannot be fetched. "Offline" means the
  session survives an outage, not that the app is installable.
- The integration suite starts the **real server in-process on an ephemeral port** and drives
  it over a real socket, including a test that *documents the race* by subscribing after the
  emit and asserting the broadcast is genuinely missed. If a future refactor moves initial
  state back onto the broadcast, that test keeps passing while the two beside it fail —
  which is the signal we want.
- Tests are written against **properties**, not transcriptions of the implementation: the
  privilege hierarchy holds, unknown roles and actions fail closed, `getPermittedActions`
  agrees with `canPerformAction` for every pair, a 500-point stroke costs the same document
  ops as a 5-point one.
- `store.test.mjs` runs against a real SQLite file in a temp dir, and reopens it in a fresh
  module instance to simulate a process restart. A mock of a database cannot tell you whether
  the schema and the queries agree.
- One test was wrong rather than the code: `exportPermissions` returns an array of
  `{ userId, permissions }`, which is a perfectly good contract. Corrected the test.
- CI (`.github/workflows/ci.yml`): build + unit tests, then a smoke job running the
  integration suite and curling `/health` against a real process. Concurrency group cancels
  superseded runs. Simulated locally end to end before committing.

**Deferred:**
- **CI has not run on GitHub**, because nothing has been pushed — the push is owner-gated and
  belongs to Sprint 8. The workflow is verified by executing each step locally; it is not
  verified by a green check on a PR, and is not claimed as such.
- No coverage threshold is enforced. Coverage numbers on a codebase this young would be a
  vanity metric; the six bugs above are the evidence that matters.
- The e2e harnesses live outside the repo (they need Playwright and a running stack). Folding
  them into CI would need a browser image and a compose step → not attempted.

---

## Sprint 6 — Deploy readiness (no spend) ✅ CLOSED 2026-08-14

**Intent:** make it deployable anywhere. Everything short of the button that needs Bruno.

- [x] `VITE_SOCKET_URL` replacing the hardcoded literal at `App.jsx:44` and the default at
      `useSocket.js:11`. A deployed frontend currently tries to reach the *visitor's own*
      localhost.
- [x] `CORS_ORIGIN` env var replacing the hardcoded array at `server.js:15`.
- [x] `GET /health` — there are currently zero HTTP routes, and every host's health check
      requires one. (`server.js:23` already reads `process.env.PORT` correctly.)
- [x] `.env.example` on both sides.
- [x] `Dockerfile` + `fly.toml` for the backend; `vercel.json` for the frontend.
- [x] Rewrite `DEPLOYMENT.md` against what actually exists, noting that serverless cannot
      host WebSockets and that a free-tier backend may cold-sleep (D5).

**Gate:** the frontend runs against a backend on a non-localhost host purely by changing env
vars — verified on the LAN, no code edit.

**Verification — PASSED 2026-08-14.**

Backend started with **only environment variables changed**:
`CORS_ORIGIN=http://192.168.1.111:4173 DATABASE_PATH=… HOST=0.0.0.0 node server.js`
→ `[SERVER] Listening on 0.0.0.0:3001`, reachable at `http://192.168.1.111:3001/health`.

Frontend built with **only an environment variable changed**:
`VITE_SOCKET_URL=http://192.168.1.111:3001 npx vite build` → the LAN address is baked into
the bundle (`grep` confirms it in `dist/assets/*.js`), served on `0.0.0.0:4173`.

**Two real browsers driven against `http://192.168.1.111:4173` — 15/15.** Creator draws,
`ONLINE (2)`, stroke crosses windows, remote cursor renders, Ctrl+Z clears both, no console
errors. **Not one line of source was edited to move the app off localhost.**

CORS is genuinely enforced rather than merely read:

```
allowed origin      → Access-Control-Allow-Origin: http://192.168.1.111:4173
disallowed origin   → (no header — the browser blocks it)
socket.io handshake → header present for the allowed origin, absent for the disallowed one
```

Regressions after the change: unit 95/95, and all six e2e gates green on the default local
stack (two-window 15/15 · persistence 9/9 · CRDT permissions 9/9 · features 11/11 · motion
12/12 · offline 8/8).

**As-shipped delta:**
- **One variable, not two.** The Yjs document URL is derived from `VITE_SOCKET_URL`,
  including the `ws://` → `wss://` upgrade — a page served over https cannot open a `ws://`
  socket, and that mixed-content block is a classic first-deploy failure.
  `VITE_COLLAB_URL` remains as an escape hatch for a split deployment.
- **`HOST` defaults to `0.0.0.0`, not localhost.** Every container platform routes to the
  container's external interface; a process bound to loopback is unreachable from outside it
  and the health check fails with no useful error.
- **The defaults still run locally with no `.env` at all.** Requiring configuration to run
  the thing on your own machine is a tax on every future contributor.
- `fly.toml` carries the two decisions that would otherwise silently lose data, with the
  reasoning in-file: a **mounted volume** (SQLite holds documents *and* membership, and a
  container filesystem is ephemeral, so without it every deploy starts from an empty board
  while still reporting healthy), and **exactly one machine** (Hocuspocus keeps each document
  in the memory of the process serving it; two machines would each hold their own copy of the
  same board and neither would see the other's edits — users would appear connected and
  silently diverge, which is worse than an outage because nobody notices).
- `auto_stop_machines = false`: scaling to zero would drop every open WebSocket mid-stroke.
- The Dockerfile runs as non-root and declares its own `HEALTHCHECK`; `better-sqlite3` is
  native, so the build image carries the toolchain needed if no prebuilt binary matches.
- `DEPLOYMENT.md` **rewritten, not patched**. The old one gave instructions for
  `VITE_SOCKET_URL`, `GET /health` and Supabase persistence at a time when none existed.
  The new one states plainly what is verified (LAN, env-only) and what is not (nothing has
  been deployed anywhere), and includes a restart-the-app check because a missing volume
  looks exactly like a working deployment until the first redeploy.

**Deferred:**
- **Nothing has been deployed.** This sprint makes deployment possible; performing it needs
  Bruno's accounts and is Sprint 8 by design (D7).
- **Horizontal scaling is not supported** and is not claimed. It needs Redis pub/sub for
  Hocuspocus and Postgres in place of SQLite. Written down in `DEPLOYMENT.md` so the
  single-machine constraint is a stated design limit rather than a lurking surprise.
- No CDN/asset budget, no rate limiting, no auth. The client id identifies a *browser*, not a
  person; anyone with a session id can open a board as a viewer. Fine for a portfolio demo,
  stated rather than implied.

---

## Sprint 7 — The demo + verified claims ✅ CLOSED 2026-08-14

**Intent:** nothing currently in the repo communicates what this is. For a collaborative
whiteboard the demo *is* the marketing.

- [x] Storyboard the two-window GIF per MOTION.md's shot list: join ring → live cursors →
      progressive stroke → shape snap → resolved comment. Then record it.
- [x] Put it at the top of the README.
- [x] Publish measured latency with its method stated (n, percentiles, loopback vs network).
      Loopback p50 is 0.25 ms; that is not the number to publish as "sync latency".
- [x] Every remaining README number traceable to a committed artifact.

**Gate:** each claim in the README maps to an artifact in the repo · the GIF shows the five
beats above.

**Verification — PASSED 2026-08-14.**

`docs/demo.gif` — 22.7 s, 2.1 MB, one continuous take recorded from the creator's window while
a second browser genuinely drives the other side over a real socket. All five beats present
and confirmed frame by frame: **join** (`ONLINE (2)`, the join toast, the role promotion) ·
**live cursors** (a remote pointer gliding, with its name chip) · **progressive stroke** (the
guest's line drawing as it happens) · **shape snap** (a wobbly polygon replaced by a clean
circle) · **comment left and resolved**. Nothing staged, nothing sped up; regenerate with
`node benchmarks/record-demo.cjs`.

**Latency, measured rather than asserted** (`benchmarks/sync-latency.cjs`, 30 samples each):

| Environment | p50 | p95 | p99 |
|---|---|---|---|
| Loopback | **8 ms** | 9 ms | 9 ms |
| LAN over Wi-Fi | **7 ms** | 16 ms | 17 ms |

The metric is deliberately *not* a socket ping: it is the time from A committing a finished
stroke to that element being present in B's document — CRDT update, server relay, remote
apply and render included. Both timestamps come from `Date.now()` in two contexts of the same
browser, so there is no clock skew to correct.

Regressions after all Sprint 7 changes: all six e2e gates green, 95/95 unit tests.

**As-shipped delta:**
- **The demo found a product bug, which is the best argument for recording one.** The guest's
  hand-drawn zigzag was silently replaced by a straight diagonal: `calculateLinearity`
  compares each point against its immediate neighbours, so a smooth wave — locally almost
  straight everywhere — scored as a line. Combined with "accepting a recognition replaces the
  stroke", an over-confident recogniser was **destroying the user's actual drawing**.
  Two fixes: `tryLine` now measures **global** straightness (deviation from the chord between
  the endpoints), and **auto-keep is gated at 0.85 confidence** — above it, doing nothing
  keeps the clean shape; below it, doing nothing keeps *your* stroke and taking the
  recognition needs a deliberate click. Silence should never cost you your work.
- **The eight acceptance harnesses are now committed** to `benchmarks/`, not left in a scratch
  directory. Every number in the README is reproducible by someone who clones the repo.
- `benchmarks/README.md` states what the numbers do **not** say: both browsers are on one
  machine, the LAN row is not two physical devices, there is no internet measurement, and
  **the portfolio's "50–80 ms sync" remains unbacked** — not contradicted, simply about a
  deployment that does not exist yet.
- **A stale number caught by the gate's own rule.** The README said shape recognition was
  447 LOC; the Sprint 5 fixes grew it to 588. Corrected — this is exactly the class of claim
  the honesty rule exists for, and it went stale within one sprint of being written.
- README rewritten around the demo: the GIF is the first thing on the page, and there is an
  explicit **Known limits** table (not deployed · one machine only · no authentication ·
  offline caches the document not the app shell · synchronised camera unfinished).

**Deferred:**
- **No deployed latency measurement**, because nothing is deployed. That is Sprint 8, and the
  number will be measured then rather than estimated now.
- The GIF is 2.1 MB. Acceptable for a README, but it is a GIF of a dark UI — an `.mp4` would
  be a fraction of the size. GitHub renders both; left as a GIF because it autoplays inline
  everywhere, including in previews that do not run video.

---

## Sprint 8 — Owner-gated (D7 — deferred to the very end) ✅ CLOSED 2026-08-14

Each item stops for `ask_human` before acting. None of Sprints 0–7 depends on any of it.
All four were put to Bruno directly; what he chose to run himself is marked `[⏭]` with the
reason rather than left ambiguous.

- [x] **`git filter-repo` author rewrite + force-push.** Approved, executed, verified.
      History was 32 commits by `Subagent <agent@openclaw>`, 13 by `Claude Code`, 8 by Bruno.
      Dry-run first on a throwaway clone; then a backup branch, a bundle of the rewritten
      history **and a bundle of the original remote state** before touching anything.
      Result: **54/54 commits attributed to Bruno**, commit count unchanged, every author
      date preserved, working tree byte-identical (`ad8f7f9` before and after).
      Pushed with `--force-with-lease`: `6248294 → f4fac6f (forced update)`.
      GitHub reports a single author across the history.
- [x] **CI ran on GitHub for the first time — and passed.** `build + test: success`,
      `end-to-end smoke: success`. Sprint 5 could only verify that workflow by executing its
      steps locally and said so; this is the real thing.
- [x] **Pre-publication audit**, done before the push rather than after:
      - `.mcp.json` (which holds an auth token) was already gitignored — confirmed, not assumed
      - `.claude/`, `.codex/`, `.cursor/` **were** tracked. Per-checkout agent wiring, full of
        absolute paths to one machine. Untracked and gitignored.
      - `benchmarks/persistence.cjs` hardcoded an absolute home-directory path, so it could only ever
        have run on this laptop. Derived from `__dirname` now, re-verified 9/9.
      - scanned the index for token-shaped strings: none
- [⏭] **Deploy to Fly + Vercel — Bruno runs it.** Asked directly; he chose the runbook. Neither
      `flyctl` nor `vercel` is installed here and both need his login, so this could not have
      been completed autonomously in any case. `docs/RELEASE.md` carries the exact commands,
      the volume that must exist or every deploy silently wipes every board, and the
      verification steps including the restart check.
      De-risked as far as possible without Docker: a production-only dependency install boots
      the server, honours `CORS_ORIGIN=*`, and the image's own `HEALTHCHECK` exits 0.
      **The Dockerfile itself is unbuilt** — no Docker daemon on this machine — so a first
      `fly deploy` may still surface a native-module issue with `better-sqlite3`. Written into
      the runbook rather than discovered on the day.
- [⏭] **Deployed latency measurement — blocked on the deploy.** `benchmarks/sync-latency.cjs`
      takes an `APP_URL`; the command is in the runbook. Nothing is estimated meanwhile.
- [⏭] **Portfolio copy — drafted, not published.** Bruno chose a placeholder until there is a
      real number. Replacement copy is in `docs/RELEASE.md` with `[MEASURE ON DEPLOY]` where
      the figure goes. **The "50–80 ms sync" line remains unbacked** — not contradicted by
      anything measured, simply about a deployment that does not exist yet.

**Gate:** two people on different machines open a URL and draw together, and the state
survives a server restart. That is the bar set in ENGINEERPROMPT.md.

**Gate status — honestly, half met.**

*Met, and verified:* the state survives a server restart — `pkill` the process, start a new
one, and 1,670 px of ink is restored exactly into a browser profile with an empty IndexedDB.
Two people draw together on one board with live cursors, correct roles and working undo:
15/15 in two real browsers, and again over the LAN against a non-localhost backend with only
environment variables changed.

*Not met:* "two people on **different machines** open a **URL**". There is no URL, because
nothing is deployed, and every measurement so far has both browsers on one machine. That is
one runbook away and the runbook is written — but it is not done, and the bar says what it says.

**As-shipped delta:**
- The **pre-publication audit was not in the plan and should have been.** Pushing is the one
  irreversible step where "look at what you are about to publish" has to happen *before*, and
  it caught two real problems: tracked machine-specific config, and a benchmark that could
  only ever run on the author's laptop.
- **Bundling both histories before the force-push** was also not in the plan. `git filter-repo`
  rewrites every ref *including the backup branch you just made*, which makes the obvious
  precaution useless. The two bundles are the real undo.

**Deferred:** nothing further. The three `[⏭]` items are Bruno's to run, by his own decision,
and each has its exact command written down.

---

## Close-out — 2026-08-14

All nine sprints (0–8) closed. Every gate passed with recorded evidence.

| | Then | Now |
|---|---|---|
| Core journey | creator assigned `viewer`, could not draw · `ONLINE (0)` | two windows draw together, 15/15 |
| Cursors | `cursor-move` never emitted by the app | interpolated, time-based, verified at 30/60/144 Hz |
| Persistence | `new Map()`, sessions **deleted** when the last user left | Yjs + SQLite; survives `pkill`, converges offline |
| Dead features | 13 client events with no server handler | 0 orphaned events |
| Tests | 0, against 15 test-report markdown files | **95**, which found 7 real bugs |
| CI | none | green on GitHub, both jobs |
| Deployable | hardcoded localhost ×3, zero HTTP routes | env-driven, verified on the LAN, `/health` |
| Design | default-browser white, emoji controls, overlapping panels | SIGNAL in one file, 4,468 → ~950 CSS lines |
| Demo | nothing communicated what it was | 22.7 s two-window recording at the top of the README |
| Authorship | 32 commits by "Subagent" | 54/54 by Bruno |
| Honesty | "Persistence" + "AI shape completion" + unbacked "50–80ms" | every claim traceable, limits tabulated |

**What is still not true, stated plainly:** it is not deployed, so there is no live URL and no
internet latency figure; it runs on one machine only; there is no authentication; offline
caches the document but not the app shell; synchronised camera is published over Awareness
with nothing consuming it. All five are in the README's *Known limits* table.

---

## Sprint D — Documentation ✅ CLOSED 2026-08-15

**Intent:** the engineering is done and the receipts are in this file, but the repo has no front
door. Run `DOCS-ENGINEERPROMPT.md`: restructure the README so a stranger sees a picture and a
number above the fold, understands the architecture from one diagram, and can find the artifact
behind every claim — and produce the machine-readable `PROJECT.json` the portfolio renders from.
No source changes; this sprint is documentation and repo metadata.

**Owner answers (Phase 2, asked before any writing):** nothing is deployed yet, so the demo GIF
leads and *not deployed* stays first in the limits table · **nothing held back** — the latency
table, the seven bugs and the authorship rewrite all appear · fix the GitHub repo card directly ·
no case study, so `PROJECT.json` links to GitHub only.

- [x] Re-measure every number this pass intends to publish rather than inheriting it.
- [x] Rewrite `README.md` to the prescribed order: hook → demo → run command → headline results
      → badges → what it does (prose) → architecture (**Mermaid**) → **how it was built** →
      results and evidence → usage with captured output → limitations → status → licence/author.
- [x] `PROJECT.json` at the repo root, schema-exact, every `metrics[].source` and
      `headline.source` pointing at a file that exists.
- [x] `docs/media/hero.png` — a real frame lifted from `docs/demo.gif` at 18 s (ffmpeg), showing
      `ONLINE (2)`, a remote cursor with its name chip, a snapped circle and a zigzag left as
      drawn. Not a mockup. `docs/demo.gif` stays at its existing path, which this file, `CLAUDE.md`
      and `benchmarks/record-demo.cjs` all reference.
- [x] Repo hygiene: root `package.json` gains `homepage`, `bugs`, `keywords`; GitHub description
      and topics corrected; two dead tracked files deleted (below).
- [x] `share_intent` before any writing; `record_verification` at the gate.

**Gate:** every number in the README traces to a committed artifact that says the same thing ·
`PROJECT.json` validates and every source path exists · Mermaid renders on GitHub · every badge
and image resolves · tests and build still green.

**Verification — PASSED 2026-08-15.** 70 scripted checks green (`verify-docs.cjs`, written for
this gate), plus four checks run by hand.

```
PROJECT.json          parses · 17 required keys · oneLiner 87/90 chars · status legal
                      · honest non-empty · 5/5 metric sources exist · headline source exists
                      · media paths exist or are explicitly null
README                20/20 local links resolve · image resolves · mermaid present
                      · zero emoji · none of blazing/seamless/powerful/robust
Numbers               8 ms / 7 ms / 16 ms / 17 ms / n=30 all match benchmarks/README.md
                      · 1,670 px, 46-corners-on-48-points, six-bugs-plus-a-seventh,
                        ORPHANED: 0 all match this file
                      · shapeRecognition.js = 588 lines · server.js = 8 socket handlers
```

By hand: GitHub's own renderer (`POST /markdown`) returns the mermaid block as
`data-type="mermaid"`, so it renders as a diagram rather than a code fence · all three badge URLs
return `image/svg+xml` 200 and the CI badge reads **passing** · `npm test` **95/95** after the
deletions · `npm run build` exit 0, 22.20 kB CSS / 443.10 kB JS.

**As-shipped delta:**
- **Correction to this file's own measured baseline.** Correction #2 (line 42) states "there is
  **no `tsconfig.json` anywhere** in the repo". That is wrong: `collab-frontend/tsconfig.json`
  existed and was tracked, with `strict: true` and `include: ["src"]`, against zero `.ts` files
  and no `typescript` dependency (D6 removed it) and nothing that runs `tsc`. `CLAUDE.md` locks
  "do not leave it ambiguous" → **deleted**. Recorded here rather than edited above, per the
  never-rewrite rule.
- **Second correction to the measured baseline: the test-report count was 14, not 15.** Both this
  file's baseline table and `RESEARCH-CONTEXT.md` record "11 `TEST_REPORT_*` / 4
  `VERIFICATION_REPORT_*`". Counted against the pre-repair tree itself —
  `git ls-tree -r --name-only 6b52410 | grep -c TEST_REPORT` — it is **10 and 4**, so 14 report
  files among 40 markdown files. The README says 14 and names the split. Caught while re-deriving
  the figure for publication rather than restating it, which is the entire point of the rule.
- **A second tracked process artifact survived Sprint 0's purge**: `REDESIGN_SUMMARY.txt`, an
  ASCII-boxed "EXPERT AUDIT + REDESIGN COMPLETION SUMMARY". It was missed because that purge
  counted `.md` files and this one is `.txt`. Deleted.
- **The GitHub repo card was contradicting the code in public**, which nothing in this repo could
  have caught: the description read "Real-time collaborative **project management dashboard** —
  React, Node.js, WebSockets, **TypeScript** … drag-and-drop", with topics including `typescript`
  and `tailwindcss`. Neither is used; it is a whiteboard, not a project-management dashboard.
  Description and topics rewritten with `gh repo edit`, and both are now also carried in
  `PROJECT.json` under `github`, so there is one source for them.
- **`PROJECT.json.media.diagram` is `null` on purpose.** The architecture diagram is Mermaid in
  the README; inventing an `architecture.svg` to fill the field would be the exact habit this
  repository was repaired to remove.
- The README's socket description changed on re-measurement: `server.js` now has **8** handlers,
  not the 16 of the audit baseline, because Sprint 2 moved every document operation onto the
  Y.Doc. socket.io is a control plane now, and the architecture section says so.
- **Three of the gate's own checks failed first, and all three were bugs in the checker**, not in
  the docs: this file hard-wraps at 90 columns so claims must be matched on normalised whitespace;
  "seven bugs" is recorded as six enumerated plus a seventh that fixing (6) exposed; and
  `split('\n').length` is one more than `wc -l` on a file with a trailing newline. Worth writing
  down — a verification script that is wrong in the lenient direction would have passed silently.

**Deferred:**
- **Nothing was committed to the portfolio itself.** `PROJECT.json` is the deliverable it reads;
  wiring it in belongs to the portfolio prompt, which runs after this one.
- `collab-frontend/src/collab/doc.test.js` carries an uncommitted flaky-test fix from a concurrent
  session (state-vector *byte length* versus decoded op count). Left unstaged and out of this
  sprint's commit — it is someone else's change to land.

---

## Verification sweep + defect repair — 2026-08-15 (post-Sprint D) ✅ CLOSED

Not a planned sprint. A full independent re-verification of the closed work, run because a
session ended mid-flight and "all sprints closed" had not been re-tested since. Six parallel
auditors: masterplan closure, test/build execution, the benchmark harnesses, an honesty pass
over every public claim, a publication-hygiene pass, and a docs-brief gap analysis.

**What held up.** All eight harnesses executed: **64/64 checks green**, 6/6 harnesses exit 0 —
`crdt-permissions` 9/9 (the viewer's write rejected server-side, both forged tokens denied),
`two-window` 15/15, `features` 11/11, `motion` 12/12, `offline` 8/8, `persistence` 9/9 with the
server genuinely killed and 1,409 px restored into a fresh profile. `npm test` 32 + 63 = **95**.
Build green, CSS **22.20 kB**. Every `[⏭]` still correctly deferred. The Known-limits table is
accurate in both directions — no limit had been silently fixed.

**What did not.**

- **A test was flaky at ~8% and nobody knew.** `collab-frontend/src/collab/doc.test.js`
  compared `Y.encodeStateVector(doc).length` across two independent `Y.Doc`s. That byte length
  is dominated by the width of the doc's *random* clientID varint, not by op count: 14 failures
  in 180 runs measured, and 20,000 fresh docs give 7 bytes 93.6% / 6 bytes 6.3%. So the
  assertion never measured what its name claimed, and **green CI was partly luck** — which
  explains the alternating pass/fail verification records in the room. Now decodes the state
  vector and sums the per-client clock, which *is* the op count. 80/80 runs green after.
- **Sprint 8's pre-publication fix did not do what it claimed.** Deleting `.claude/`, `.codex/`
  and `.cursor/` at HEAD in `f4fac6f` left the blobs reachable from `origin/main` in eight
  commits — `git filter-repo` had rewritten *authorship*, not content. They exposed the absolute
  path layout of an unrelated private project. No credential was ever committed; `.mcp.json` and
  `opencode.json` were correctly never tracked. Corrected by a second rewrite, with consent.
- **`API.md` contradicted `DEPLOYMENT.md`** on the repository's headline deployability claim: it
  said `VITE_SOCKET_URL` and `CORS_ORIGIN` were "not implemented yet — URLs still hardcoded to
  localhost". Both have been implemented since Sprint 6. The env table also omitted four of the
  six real variables.
- **`docs/RELEASE.md` opened with "Nothing here has been done"** while steps 1–2 were done, and
  cited 53 commits and a three-author table against an actual 55 commits under one author.
- **Two stale nested lockfiles would have broken step one of the deploy runbook.**
  `collab-frontend/package-lock.json` still pinned the removed `typescript` and knew nothing of
  `@hocuspocus/provider`, `yjs`, `y-indexeddb` or `vitest`; `vercel.json` sets
  `installCommand: npm install`, so a Vercel build rooted there installs a tree with no Yjs and
  fails on the first import. Nothing reads them under npm workspaces, so nothing caught the drift.
- **`better-sqlite3` was required but declared nowhere** (`collab-backend/store.js:21`),
  resolving only by hoist from `@hocuspocus/extension-sqlite`. Green by luck of the tree shape.
- **Two test hooks were dead.** `window.__socketForTest` and `window.__strokeCountForTest` exist
  in no source file, so `sync-latency.cjs`'s socket-RTT line — the transport-versus-end-to-end
  distinction this repository keeps insisting on — **silently never printed**. The socket handle
  is now exposed in dev builds; the unused stroke-count read is gone.
- **`record-demo.cjs` does not produce `docs/demo.gif`.** It writes a `.webm`; the conversion was
  done by hand and no converter is committed. Both `README.md` and `benchmarks/README.md` said
  otherwise. The GIF is genuine, but it is not reproducible from this repository alone.
- **`APP_URL` is honoured by three of eight harnesses**, not all of them. Five hardcode
  `localhost` and can only run locally — so Sprint 6's LAN evidence covers `two-window` only.

**Corrections to claims recorded earlier in this file — the entries above stand as written;
these are the amendments:**

1. **`sprint1-protocol.cjs` does not exist and never did.** Sprint 1's "14/14 at protocol level"
   cites it; `git log --all --name-only` across the entire history has no path matching it. It
   was a scratch file, never committed. The 14 assertions are listed in prose but nothing in the
   repository emits them. `crdt-permissions.cjs` is the only wire-level harness and emits 9. By
   this project's own honesty rule that number is **unbacked** — the same defect class as the
   "50–80 ms sync" line it was written to avoid.
2. **"fifteen test-report markdown files" is fourteen** — ten `TEST_REPORT_*` plus four
   `VERIFICATION_REPORT_*` at commit `6b52410`. An unverified number inside the paragraph about
   unverified numbers, in both `benchmarks/README.md` and this file.
3. Sprint 6's CORS evidence is a recorded `curl` observation, not a harness; Sprint 8's "CI
   passed" is a GitHub Actions result. Both are fine — noting that neither is a `benchmarks/`
   artifact, for anyone auditing that folder against the claims.

**Deferred:**
- **The 14/14 protocol claim is left standing but flagged, not deleted** — masterplan content is
  never rewritten. Either a harness gets written that emits those 14 assertions, or the number
  comes out of the current-state summary. Not done here because it is Sprint 1's gate, and
  re-opening a closed gate needs a decision, not a patch.
- `AGENTS.md` and `GEMINI.md` remain tracked and byte-identical. They carry no paths or secrets,
  and publishing them may well be intentional, so they were left alone rather than guessed at.
- The 8 npm advisories (3 high, all `ws` via `socket.io-adapter`) are untouched: the fix is an
  upstream bump, not a local change.

**The second history rewrite, as executed (2026-08-15).** Bruno was asked and chose the
rewrite over leaving it. A bundle of all refs was taken first (`collab-dashboard-backup-
6a43c63.bundle`, 2.8 MB, outside the repo) because `git filter-repo` rewrites backup branches
too — the lesson already learned in Sprint 8.

```
git filter-repo --invert-paths --path .claude --path .codex --path .cursor --force
```

Result: **57 commits preserved, one author, working tree byte-identical** — the tree hash is
`699395b` both before and after, which is the check that matters, since the point was to change
history without changing the checkout. `git log --all --name-only` now returns no path under
`.claude/`, `.codex/` or `.cursor/`. Pushed `b7b7fe4 → 258013e` with `--force-with-lease`.

**A correction to the paragraph above, caught by the pre-public audit.** An earlier draft of it
claimed `git grep` over every reachable commit finds no reference to the private-project path —
and the sentence making that claim contained the string, so it was its own counterexample. Two
things are true and worth separating. The **agent-config files** are gone from history, which was
the point. But `filter-repo --invert-paths` removes *paths*, never *content*: a home-directory
string written into a source file survives in whatever commit introduced it. One such string
remains in history, in a superseded revision of `benchmarks/persistence.cjs`, which was fixed at
HEAD in Sprint 8. It is a benchmark's working directory, not a secret, and a third rewrite to
chase it would cost every SHA again for no security gain. Recorded rather than repaired.

Worth stating plainly: **every SHA in this file that predates 2026-08-15 refers to the old
history and no longer resolves.** That is the cost of the fix, it was known before it was
chosen, and it is the second time this repository has paid it — because the first rewrite
addressed authorship without noticing that the same pass could have addressed content.
