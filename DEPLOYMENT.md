# Deployment

**Accurate as of Sprint 6 (2026-08-14).** Every variable, file and endpoint named here exists
in the repository. The previous version of this document gave instructions for
`VITE_SOCKET_URL`, `GET /health` and Supabase persistence at a time when none of the three
existed; it has been rewritten rather than patched.

**What has been verified:** the frontend runs against a backend on a **non-localhost host,
purely by changing environment variables, with no code edit** — driven with two real browsers
over the LAN, 15/15 checks. **What has not:** nothing has been deployed to a hosting provider.
That step needs Bruno's accounts and is deliberately the last thing in `masterplan.md`.

---

## The shape of the thing

```
   browser ──── HTTPS ────▶  static frontend        (Vercel, or any CDN)
      │
      ├──────── WSS ──────▶  /socket.io            ┐
      └──────── WSS ──────▶  /collaboration        ┘  ONE Node process (Fly / Railway)
                                                       └── SQLite on a mounted volume
```

**Serverless cannot host this backend.** A collaborative session is a WebSocket that stays
open for as long as someone is drawing; functions are billed and killed per request. The
backend needs a long-lived process, which is why it ships as a container.

Both protocols share one HTTP server on one port. That is not an accident — free tiers give
you one always-on process, so needing two would double the cost of running this at all.

---

## Environment

### Backend — `collab-backend/.env.example`

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | Most hosts inject this. Do not hardcode it there. |
| `HOST` | `0.0.0.0` | **Do not set this to `localhost` in a container.** A process bound to loopback is unreachable from outside the container and the health check fails with no useful error. |
| `CORS_ORIGIN` | the two localhost dev origins | Comma-separated. `*` allows any origin. |
| `DATABASE_PATH` | `./data/collab.sqlite` | **Must point at a mounted volume in production.** |

### Frontend — `collab-frontend/.env.example`

| Variable | Default | Notes |
|---|---|---|
| `VITE_SOCKET_URL` | `http://localhost:3001` | Usually the only one you need. |
| `VITE_COLLAB_URL` | derived | Escape hatch for a split deployment. |

The Yjs document URL is **derived** from `VITE_SOCKET_URL`, including the `ws://` → `wss://`
upgrade: a page served over https cannot open a `ws://` socket — the browser blocks it as
mixed content — and that is a classic first-deploy failure.

> **Vite inlines `VITE_*` at BUILD time, not runtime.** A build made with the wrong value
> cannot be fixed by changing the environment and restarting; it has to be rebuilt. Set these
> before `npm run build`.

---

## Two things that will silently lose data if you skip them

**1. Mount a volume.** SQLite holds the Yjs documents *and* session membership. Container
filesystems are ephemeral, so without a volume every deploy starts from an empty board while
the app still reports itself healthy. `fly.toml` declares the mount; the volume itself has to
be created once:

```bash
fly volumes create collab_data --size 1
```

**2. Run exactly one machine.** Hocuspocus keeps each document in the memory of the process
serving it, and SQLite is a local file. Two machines would each hold their own copy of the
same board and neither would see the other's edits — users would appear connected and silently
diverge, which is worse than an outage because nobody notices. `fly.toml` pins one machine
and disables scale-to-zero (scaling to zero would drop every client mid-stroke).

Horizontal scaling needs a shared backend — Redis pub/sub for Hocuspocus, Postgres in place of
SQLite — before more than one machine is safe. Not built; not claimed.

---

## Backend → Fly.io

```bash
cd collab-backend
fly launch --no-deploy          # rewrites app name and region in fly.toml
fly volumes create collab_data --size 1
fly secrets set CORS_ORIGIN=https://your-frontend.vercel.app
fly deploy
fly logs
curl https://your-app.fly.dev/health
```

`/health` returns:

```json
{ "status": "ok", "uptime": 42, "sessions": 3,
  "documents": 1, "connections": 2, "persistence": "sqlite" }
```

`fly.toml` already points the platform health check at it.

### Or any container host

```bash
docker build -t collab-backend ./collab-backend
docker run -p 3001:3001 \
  -e CORS_ORIGIN=https://your-frontend.example.com \
  -e DATABASE_PATH=/data/collab.sqlite \
  -v collab-data:/data \
  collab-backend
```

The image runs as a non-root user and declares its own `HEALTHCHECK`.

---

## Frontend → Vercel

```bash
cd collab-frontend
vercel                                   # link the project
vercel env add VITE_SOCKET_URL           # https://your-app.fly.dev
vercel --prod
```

`vercel.json` sets the Vite framework preset, rewrites all non-asset paths to `index.html` so
a deep link does not 404, and marks hashed assets immutable.

**Deploy the backend first.** The frontend bakes the backend URL in at build time, so it has
to exist before you build.

---

## Free tier, honestly

Bruno's decision was free-tier only (`masterplan.md`, D5). What that actually means:

- **Fly's free allowance covers a small always-on machine with a 1 GB volume.** This app fits.
- `auto_stop_machines = false` is set deliberately. Scale-to-zero would drop every open
  WebSocket, so a returning user finds a disconnected board. If the allowance ever forces
  scale-to-zero back on, the first request after an idle period pays a cold start and every
  previously-connected client has to reconnect — the CRDT will reconcile them, but it is not
  the "always-on" experience, and the README should say so rather than imply otherwise.
- **A free tier is not a durability guarantee.** The volume is one disk in one region with no
  backups configured. Fine for a portfolio demo; not fine for anything that matters.

---

## Verifying a deployment

```bash
# 1. the backend is up and reports its real state
curl https://your-app.fly.dev/health

# 2. CORS is configured for the frontend you actually deployed
curl -i -H "Origin: https://your-frontend.vercel.app" \
     https://your-app.fly.dev/health | grep -i access-control-allow-origin

# 3. an unexpected origin gets NO header back (the browser then blocks it)
curl -i -H "Origin: https://not-your-site.example" \
     https://your-app.fly.dev/health | grep -i access-control-allow-origin

# 4. persistence is real: draw something, then
fly apps restart your-app
#    reload the board. If it is empty, the volume is not mounted.
```

Step 4 is the one people skip, and it is the one that catches a missing volume — which
otherwise looks exactly like a working deployment until the first redeploy.

---

## Local development

```bash
npm install     # installs both workspaces
npm run dev     # backend :3001, frontend :5173
```

No `.env` is needed locally; every default is the development value.
