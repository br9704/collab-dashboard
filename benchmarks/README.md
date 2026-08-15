# Benchmarks and acceptance harnesses

Every number in the project README is produced by something in this folder. That is the
point: the repository previously carried a "50–80 ms sync" claim with nothing behind it, and
fourteen report markdown files — ten `TEST_REPORT_*` and four `VERIFICATION_REPORT_*` —
describing tests nobody had written. (Counted at commit `6b52410`, the last commit before
this work started. An earlier draft of this paragraph said fifteen, which was itself an
unverified number in the paragraph about unverified numbers.)

These are **not** part of `npm test`. They drive real browsers against a running stack, so
they need Playwright and both services up:

```bash
npm install --no-save playwright && npx playwright install chromium

npm run dev                        # backend :3001, frontend :5173
node benchmarks/sync-latency.cjs   # in another shell
```

Playwright is deliberately not a project dependency — it would add a browser download to
every `npm install` for something only run by hand.

| Script | What it proves |
|---|---|
| `sync-latency.cjs` | end-to-end sync time — the number in the README |
| `two-window.cjs` | the core journey: two windows, one board, drawing together |
| `persistence.cjs` | the board survives an actual `pkill` of the server process |
| `crdt-permissions.cjs` | a viewer's write is refused **at the wire**, with no UI involved |
| `features.cjs` | every control round-trips to a second window |
| `motion.cjs` | MOTION.md's acceptance checklist, and the SIGNAL design rules |
| `offline.cjs` | edits made offline reconcile without clobbering concurrent work |
| `record-demo.cjs` | records the demo take — see the note below |

`APP_URL` overrides the frontend address in `two-window.cjs`, `sync-latency.cjs` and
`record-demo.cjs` — those three, which is how the deploy-readiness gate was run against a
non-localhost host. The other five (`persistence.cjs`, `features.cjs`, `motion.cjs`,
`offline.cjs`, `crdt-permissions.cjs`) still hardcode `localhost:5173`/`localhost:3001` and
can only be run locally.

`record-demo.cjs` writes a `.webm` and prints its path. It does **not** produce
`docs/demo.gif`: the webm→gif conversion was done by hand and no converter is committed, so
the GIF is not currently reproducible from this repository alone.

---

## What "sync latency" means here

A `latency-ping` round trip measures the **transport**. It says nothing about the product, and
conflating the two is how an unbacked number gets written down.

`sync-latency.cjs` measures what a user actually experiences:

```
t0   A commits a finished stroke to its document
t1   that element is present in B's document
```

Both timestamps come from `Date.now()` in two contexts of the **same browser on the same
machine**, so there is no clock skew to correct for. The figure includes the CRDT update, the
server relay, the remote apply and the render — everything between one person lifting the pen
and another person seeing the line.

## Results — 2026-08-14, 30 samples each

| Environment | p50 | p95 | p99 | range |
|---|---|---|---|---|
| Loopback (`localhost`) | **8 ms** | 9 ms | 9 ms | 6–9 ms |
| LAN address over Wi-Fi | **7 ms** | 16 ms | 17 ms | 6–17 ms |

Method: macOS, Node 24, Chromium via Playwright, backend and frontend both local.

### What these numbers do NOT say

- **Both browsers run on one machine.** The LAN row exercises the real network stack rather
  than the loopback interface, but it is not two physically separate devices, and it is
  certainly not two people in different cities.
- **There is no internet measurement**, because nothing has been deployed. Over a real
  connection the figure will be dominated by round-trip time to the server — a European user
  against a European host might see 30–60 ms; the same host from another continent, far more.
  That number will be measured once the app is deployed, and not guessed before.
- **The portfolio's "50–80 ms sync" is still unbacked.** It is not contradicted by these
  results — it is simply about a deployment that does not exist yet. It should not be
  published until it can be measured.
