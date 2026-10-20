# syntax=docker/dockerfile:1.7
# The app image: Next.js standalone server, the claude CLI and claude-pool (specs/infrastructure.md).
# It is public on GHCR, so no secrets go in here: accounts, .env and certs come in through volumes.

FROM node:24-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 falls back to compiling when there is no prebuilt binary.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# public/ is empty and not in git; the runtime stage copies it.
RUN mkdir -p public && npm run build

FROM node:24-bookworm-slim
ARG CLAUDE_CODE_VERSION=2.1.304
# python3-pypdf: the stats crawler parses the RZS match PDFs (scripts/crawl.py, specs/stats-pipeline.md).
# python3-fitz (PyMuPDF): scripts/review.py renders PDF pages to PNG for the AI review and audit.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pypdf python3-fitz git ca-certificates && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force
# claude-pool v0.16.1, pinned by hash: https://github.com/grega-rotar/claude-pool/releases/tag/v0.16.1
ADD --chmod=755 --checksum=sha256:e96ee87a1dc6ae953639062ec10a8545e33e64aef76d01c3d4aa004913567300 \
    https://github.com/grega-rotar/claude-pool/releases/download/v0.16.1/claude_pool.py /usr/local/bin/claude-pool

# Non-root user `app` (uid 1000) in place of the image's `node` user, because Claude can run commands.
RUN userdel -r node && useradd -u 1000 -m -d /home/app -s /bin/bash app \
 && mkdir -p /data /home/app/.claude /home/app/.config/claude-pool \
 && chown -R app:app /data /home/app

WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts ./scripts

USER app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/app.db \
    STATS_DB_PATH=/data/stats.db \
    STATS_DATA_DIR=/data \
    WORK_DIR=/data/work \
    CLAUDE_BIN=claude-pool \
    CLAUDE_POOL_DIR=/home/app/.config/claude-pool \
    CLAUDE_POOL_STATE=/data/claude-pool-state.json \
    DISABLE_AUTOUPDATER=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
