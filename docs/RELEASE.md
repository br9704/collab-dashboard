# Release runbook — Sprint 8

Everything in this file needs Bruno's accounts or his explicit go-ahead. Nothing here has
been done. Each step has been prepared and de-risked as far as it can be without those
credentials, and what was verified is stated per step.

Order matters: **authorship rewrite → push → deploy → measure → publish.** Rewriting history
after pushing means force-pushing over a public branch someone may already have cloned.

---

## 0. What is waiting

```
8 sprint commits, on main, never pushed.
```

The remote is still at the pre-repair state. Everything below — the working whiteboard, the
persistence, the tests, the demo — exists only on this machine.

---

## 1. Rewrite authorship  ·  irreversible once pushed

Current history:

| Author | Commits |
|---|---|
| `Subagent <agent@openclaw>` | 32 |
| `Claude Code <claude@code.local>` | 13 |
| `Bruno Jaamaa <jaamaabruno@gmail.com>` | 8 |

**Verified on a throwaway clone (2026-08-14):** the rewrite reattributes all 53 commits,
preserves the commit count and every author date, and leaves the working tree
**byte-identical** (same tree hash, `96c7ffd`).

```bash
# Back the current state up first. This is the only undo.
git branch backup/pre-authorship-rewrite

cat > /tmp/mailmap <<'EOF'
Bruno Jaamaa <jaamaabruno@gmail.com> Subagent <agent@openclaw>
Bruno Jaamaa <jaamaabruno@gmail.com> Claude Code <claude@code.local>
EOF

git filter-repo --force --mailmap /tmp/mailmap
git log --format='%an <%ae>' | sort | uniq -c    # expect one author, 53 commits
```

`git filter-repo` removes the `origin` remote by design, to stop an accidental push mid-rewrite:

```bash
git remote add origin https://github.com/br9704/collab-dashboard.git
```

> **This is the point of no return.** Rewriting published history changes every commit hash.
> Anyone holding a clone gets a divergent branch. For a personal repo with no collaborators
> that is fine; it is worth being sure of that before the force-push, not after.

---

## 2. Push

```bash
git push --force-with-lease origin main
```

`--force-with-lease` rather than `--force`: it refuses if the remote moved since the last
fetch, which is the difference between overwriting your own history and overwriting
someone else's.

**CI runs for the first time on this push.** `.github/workflows/ci.yml` has been verified by
executing each step locally; it has never run on GitHub, because nothing has ever been pushed.
Expect to fix something — a first CI run that goes green on the first attempt is the exception.

---

## 3. Deploy the backend  ·  Fly.io, free allowance

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

**Verified without Docker (2026-08-14):** a production-only dependency install
(`npm install --omit=dev`) boots the server, honours `CORS_ORIGIN=*`, and the image's own
`HEALTHCHECK` command exits 0 against `/health`. The Dockerfile itself has **not** been built
— no Docker daemon on this machine — so a first `fly deploy` may still surface a build issue,
most likely around `better-sqlite3`'s native module.

---

## 4. Deploy the frontend  ·  Vercel

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

---

## 5. Verify the deployment

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

---

## 6. Measure deployed latency, and only then publish a number

```bash
APP_URL=https://<project>.vercel.app LABEL="deployed (internet)" \
  node benchmarks/sync-latency.cjs
```

Local figures today: **p50 8 ms loopback, 7 ms / p95 16 ms LAN** — both with two browsers on
one machine.

The portfolio's **"50–80 ms sync" is currently unbacked**. It is not contradicted by anything
measured; it is about a deployment that does not exist. Once the command above produces a
number, either the copy matches it or the copy changes.

---

## 7. Portfolio copy — proposed, not published

Replace the current line with something the repository can defend:

> **Collab Dashboard** — a real-time collaborative whiteboard. Strokes, shapes and text live
> in a CRDT (Yjs) synced over WebSockets and persisted to SQLite, so a board survives a server
> restart and concurrent edits merge instead of overwriting each other. Roles are enforced at
> the document connection rather than in the UI: a viewer's write is refused at the wire.
> 95 tests; measured end-to-end sync of `[MEASURE ON DEPLOY]` p50.

`[MEASURE ON DEPLOY]` stays a placeholder until step 6 produces a real figure. Publishing an
estimate is the exact habit this repair set out to remove.
