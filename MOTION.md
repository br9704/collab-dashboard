# MOTION.md — COLLAB DASHBOARD
# Animation spec. Read with `CLAUDE.md` and `RESEARCH-CONTEXT.md`; binding.
# NOTE: nothing here matters until the VIEWER role bug and presence registration are fixed. Motion is Sprint 3+, after the core journey works.

> A collaborative whiteboard's motion problem is unique: **most movement on screen is other people.** Your job is not to animate the UI — it's to make other humans' actions feel smooth, attributable, and unstartling. Everything else stays almost still.

---

## Inherited system

Monochrome chrome, green only for live/connected. Ease-out/linear, ≤600ms, no bounce. Terminal loaders, `>` machine speech, monospace labels. Replace the emoji toolbar (✏️ 📏 ▭ ⭕ 📝 💾 👁️) with monospace glyph buttons in the house style. **A11y:** reduced-motion = cursors snap instead of glide, no halos, no pulses; nothing flashes >3×/s.

---

## Remote presence (the product)

**Cursors.** Raw socket events arrive at 20–30Hz and jitter. Render remote cursors with interpolation: buffer ~80ms and ease each cursor toward its latest position (exponential smoothing, time-based, frame-rate independent). Never `transition: left/top` in CSS — transform only, in the canvas render loop. A remote cursor should feel like a hand, not a teleporter.

- Each cursor carries a name chip that trails 12px behind movement and fades to 40% after 2s idle; any movement restores it.
- **Join:** cursor scales 0→1 (200ms) with a single expanding 1px ring, and `> anna joined` prints in the activity feed. **Leave:** fade to 0 over 400ms. No modal, no toast for presence — presence is ambient.
- Idle >30s: cursor dims to 25%.

**Live strokes.** Remote strokes draw progressively as their points stream in — the other person's line *draws*, it does not appear finished. Buffer by the same 80ms as cursors so the pen and its line stay attached. On stroke end, a final reconciliation pass replaces the streamed segments with the canonical path (invisible if interpolation is right — verify by diffing).

**Own strokes render with zero added latency.** Local ink is sacred: no smoothing delay, no buffering, no animation between pointer and pixel. All motion budget is spent on *remote* smoothness.

## State changes

- **Undo/redo (any user):** the affected stroke/shape flashes to 50% opacity and back over 240ms as it disappears/reappears, so a remote undo reads as deliberate removal, not data loss. The actor's name prints in the activity feed.
- **Shape recognition** (the renamed "AI shape completion"): the raw stroke cross-fades into the recognised shape over 250ms — overlap them 100ms so it reads as *snapping into* the clean form. A dismissible `> looks like a rectangle — keep?` chip appears for 3s; ignoring it keeps the recognition.
- **Comments:** pins scale in 0→1, 200ms. An unresolved pin carries the 2s status pulse; resolving collapses the thread 280ms and the pin turns static. Green appears exactly twice in this app: the connection dot, and a resolved-comment tick.
- **Role changes:** when someone's role changes, their name chip cross-fades to the new badge — and if *your* role changes, a single toast slides down: `> you can now edit`. (The current bug — creator locked as VIEWER — makes this the most ironic missing animation in the codebase.)

## Connection state (honest, like everything else)

- Top-right dot: green solid = connected; on disconnect it hollows and pulses while `> reconnecting...` types beside it; on reconnect, solid + `> back — syncing 4 changes`, then the missed operations replay **batched over ≤800ms**, not one-by-one (a 200-op replay animated individually is a horror film).
- The latency meter (already real — 2ms local) counts between values rather than jumping, and only updates twice per second max.

## Canvas navigation

- Own pan/zoom: direct 1:1, zero smoothing (like local ink).
- "Follow" / jump-to-user (if synced camera stays): 400ms ease-out fly, then a 1px ring pulse where they are. Following someone else's camera live: interpolate with the same 80ms buffer.
- Zoom indicator counts (`100% → 140%`), never fades in/out repeatedly.

## Acceptance

- [ ] Two-window test recorded: remote cursor glides (no teleporting), remote stroke draws progressively, own ink has zero added latency (side-by-side comparison)
- [ ] Interpolation is time-based — verified identical at 60Hz and 144Hz displays
- [ ] Kill the server mid-draw: disconnect state appears, reconnect replays batched, recorded
- [ ] Remote undo flash distinguishable from deletion in a blind test (ask someone)
- [ ] Shape-recognition snap recorded; the keep/dismiss chip works
- [ ] Reduced-motion pass: cursors snap, no halos, no pulses, everything still attributable via the activity feed
- [ ] The README's two-window GIF showcases: join ring → live cursors → progressive stroke → shape snap → resolved comment. That GIF is the marketing; storyboard it, then record it.
