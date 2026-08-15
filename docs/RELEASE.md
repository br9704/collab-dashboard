# Release runbook — Sprint 8

Everything in this file needs Bruno's accounts or his explicit go-ahead.

**Steps 1-5 are DONE. The app is deployed and public (2026-08-15).** Each remaining step has
been prepared and de-risked as far as it can be without those credentials, and what was
verified is stated per step.

Order matters: **authorship rewrite → push → deploy → measure → publish.** Rewriting history
after pushing means force-pushing over a public branch someone may already have cloned.

---

## 0. What is waiting  ·  DONE

Nothing. The commits are pushed, the app is deployed, and the latency has been measured.
What remains is a hosting decision (a paid Fly machine) and the portfolio copy edit itself.

---

## 1. Rewrite authorship  ·  DONE 2026-08-14  ·  irreversible once pushed

History before the rewrite:

| Author | Commits |
|---|---|
| `Subagent <agent@openclaw>` | 32 |
| `Claude Code <claude@code.local>` | 13 |
| `Bruno Jaamaa <jaamaabruno@gmail.com>` | 8 |

**Verified on a throwaway clone first (2026-08-14):** the rewrite reattributes all 53 commits
as of that check, preserves the commit count and every author date, and leaves the working
tree **byte-identical** (same tree hash, `96c7ffd`).

**As executed:** 54/54 commits reattributed to `Bruno Jaamaa <jaamaabruno@gmail.com>`, author
dates preserved, working tree byte-identical, `6248294 → f4fac6f`. Two history bundles were
taken first, because `git filter-repo` rewrites the backup branch too.

> A **second** rewrite ran on 2026-08-15 to strip `.claude/`, `.codex/` and `.cursor/` from
> the whole history. Deleting them at HEAD in `f4fac6f` did not unpublish them — the blobs
> stayed reachable from `origin/main` in eight commits, exposing the absolute path layout of
> an unrelated private project. No credential was ever committed. See step 2's note.

```bash
# Back the current state up first. This is the only undo.
git branch backup/pre-authorship-rewrite

cat > /tmp/mailmap <<'EOF'
Bruno Jaamaa <jaamaabruno@gmail.com> Subagent <agent@openclaw>
Bruno Jaamaa <jaamaabruno@gmail.com> Claude Code <claude@code.local>
EOF

git filter-repo --force --mailmap /tmp/mailmap
git log --format='%an <%ae>' | sort | uniq -c    # expect one author
```

`git filter-repo` removes the `origin` remote by design, to stop an accidental push mid-rewrite:

```bash
git remote add origin https://github.com/br9704/collab-dashboard.git
```

> **This is the point of no return.** Rewriting published history changes every commit hash.
> Anyone holding a clone gets a divergent branch. For a personal repo with no collaborators
> that is fine; it is worth being sure of that before the force-push, not after.

---

## 2. Push  ·  DONE 2026-08-14

```bash
git push --force-with-lease origin main
```

`--force-with-lease` rather than `--force`: it refuses if the remote moved since the last
fetch, which is the difference between overwriting your own history and overwriting
someone else's.

**CI ran for the first time on this push, and passed on the first attempt** — both jobs
(`build + test`, `end-to-end smoke`), which the note here had said would be the exception.
Two runs on `main` to date, both `success`.

One caveat found later and fixed on 2026-08-15: `collab-frontend/src/collab/doc.test.js`
carried an assertion that compared *encoded state-vector byte lengths* across two independent
`Y.Doc`s. That length is dominated by the width of the doc's random clientID varint, so it
failed roughly 8% of runs (measured: 14 failures in 180). Green CI up to that point was
partly luck. The assertion now counts CRDT operations directly and passed 80/80.

---

## 3. Deploy the backend  ·  DONE 2026-08-15  ·  Fly.io, and it is NOT free

Neither `flyctl` nor `vercel` is installed on this machine, so this is a fresh setup.

```bash
brew install flyctl
fly auth login

cd collab-backend
fly launch --no-deploy          # rewrites app name and region in fly.toml

# WITHOUT THIS, EVERY DEPLOY WIPES EVERY BOARD.
fly volumes create collab_data --size 1

fly deploy
curl https://<app>.fly.dev/health
```

**As executed:** live at `https://collab-dashboard-backend.fly.dev`, region `lhr`, one machine,
1 GB encrypted volume. `better-sqlite3` did **not** cause trouble — `prebuild-install` found the
linux-x64 prebuilt binary for Node 22's ABI, so nothing compiled.

The volume was verified rather than assumed: `fly ssh console -C "df -h /data"` shows `/dev/vdc`
mounted, holding `collab.sqlite` and its `-wal`/`-shm`, owned by `node`. Fly mounts volumes with
`uid: 1000, gid: 1000`, which is why the Dockerfile's `VOLUME` line preceding its `chown` — a
real ordering bug, since Docker discards directory changes made after `VOLUME` — did not bite.

> **This costs money.** Fly's free allowance is gone. Without a card the machine stops itself
> after five minutes idle (`Trial machine stopping…`) and is CPU-throttled — which is where most
> of the measured 299 ms goes. A `shared-cpu-1x` 512 MB machine plus a 1 GB volume is roughly
> $3-4/month.

---

## 4. Deploy the frontend  ·  DONE 2026-08-15  ·  Vercel

```bash
npm i -g vercel
cd collab-frontend
vercel                                    # link
vercel env add VITE_SOCKET_URL            # https://<app>.fly.dev  — all environments
vercel --prod
```

Then close the loop, or the browser blocks every connection:

```bash
fly secrets set CORS_ORIGIN=https://<project>.vercel.app
```

**Two things this runbook did not warn about, both of which bit:**

1. **`vercel.json` was invalid and always had been.** It carried a `comment` key inside the
   rewrite object; Vercel validates against a schema with `additionalProperties: false` there,
   so the deploy failed before building. A runbook never executed is a hypothesis.
2. **Deployment Protection is on by default**, so the first successful deploy was reachable only
   behind a Vercel SSO login. Turn it off in Project → Settings → Deployment Protection, or the
   "live URL" is live only for you.

Live at **`https://collab-frontend-omega.vercel.app`**.

---

## 5. Verify the deployment  ·  DONE 2026-08-15

```bash
curl https://<app>.fly.dev/health

# CORS actually configured for the frontend that exists
curl -i -H "Origin: https://<project>.vercel.app" https://<app>.fly.dev/health \
  | grep -i access-control-allow-origin

# THE ONE PEOPLE SKIP: draw something, then
fly apps restart <app>
# reload the board. If it is empty, the volume is not mounted — and a missing
# volume looks exactly like a working deployment until the first redeploy.
```

Then the real two-window test, from two different machines if possible.

**As executed:** `APP_URL=https://collab-frontend-omega.vercel.app node benchmarks/two-window.cjs`
→ **15/15 against the live deployment**, including `ONLINE (2)` in both windows, 788 px of the
creator's stroke rendered in the joiner's, undo clearing both, and zero console errors.

Still *not* two different machines: both browser contexts run on one laptop.

---

## 6. Measure deployed latency, and only then publish a number  ·  DONE 2026-08-15

```bash
APP_URL=https://<project>.vercel.app LABEL="deployed (internet)" \
  node benchmarks/sync-latency.cjs
```

Local figures today: **p50 8 ms loopback, 7 ms / p95 16 ms LAN** — both with two browsers on
one machine.

**Measured, 30 samples:** deployed **p50 299 ms, p95 382 ms, p99 382 ms**.

Almost none of it is the product, and that was isolated rather than asserted:

- `GET /` does **no** database work and returns a static object. It costs the same ~285 ms as
  `GET /health`, so the time is neither SQLite nor application logic.
- Over a **held-open** WebSocket, where the machine cannot idle, `latency-ping` round-trips at
  **p50 322 ms, min 283 ms** — against a network round trip of ~25 ms (TCP connect 24 ms).

A trivial ping costing ~285 ms of server time on a warm, `started` machine is sustained CPU
throttling on the free tier. Budget: ~25 ms network + ~7-8 ms application + ~285 ms throttling.

Re-measure if the machine is ever paid for. Until then 299 ms describes Fly's free tier, and
7-8 ms describes this code.

The portfolio's **"50–80 ms sync" is now withdrawn, not deferred.** It was unbacked; it is now
contradicted from both directions — 7-8 ms locally, 299 ms deployed. Nothing measured in this
repository has ever produced 50-80 ms.

---

## 7. Portfolio copy — ready to publish, with a real number

Replace the current line with something the repository can defend:

> **Collab Dashboard** — a real-time collaborative whiteboard. Strokes, shapes and text live
> in a CRDT (Yjs) synced over WebSockets and persisted to SQLite, so a board survives a server
> restart and concurrent edits merge instead of overwriting each other. Roles are enforced at
> the document connection rather than in the UI: a viewer's write is refused at the wire.
> 95 tests. End-to-end sync measured at **7 ms p50 on a LAN**; **299 ms p50** against the live
> deployment, where most of the difference is a free-tier host, not the product.

The placeholder is gone because there is a real figure. Note that the honest version cites *both*
numbers: quoting only the 7 ms would describe a LAN, and quoting only the 299 ms would describe
Fly's trial tier. Neither alone is the product.
