# ── Collab Dashboard backend ─────────────────────────────────────────────────
# A WebSocket backend needs a long-lived process. Serverless platforms cannot
# host one, which is why this is a container and not a function.

FROM node:22-slim AS base

# better-sqlite3 is a native module. node:22-slim ships prebuilt binaries for
# linux/amd64; python3 and build-essential are the fallback if it has to compile.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall the world.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# SQLite holds both the Yjs documents and session membership. Mount a volume
# here in production, or every deploy silently starts from an empty board.
ENV DATABASE_PATH=/data/collab.sqlite
RUN mkdir -p /data
VOLUME ["/data"]

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001

# Run as a non-root user, and give it the data directory it has to write to.
RUN chown -R node:node /app /data
USER node

# The platform health check hits /health; this one catches a wedged process
# between platform probes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
