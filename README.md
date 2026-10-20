# rokomet-stats

Chat UI for Slovenian handball stats. Each message is answered by Claude through `claude-pool`. Design and plans: [`specs/`](specs/README.md).

## Run locally

Needs Node 24 and `claude-pool` (or `claude`) on your `PATH`.

```sh
npm install
cp .env.example .env.local   # set APP_PASSWORD and AUTH_SECRET (openssl rand -hex 32)
npm run dev                  # http://localhost:3000
```

The SQLite file and the per-chat working folders go to `./data/` (git-ignored). Migrations run on server start.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks (what CI runs) |
| `npm run build` then `npm start` | Production build (`output: "standalone"`) |
| `npm run db:generate` | New migration in `drizzle/` after changing `src/db/schema.ts` |

## Layout

| Path | What |
|---|---|
| `src/app/chat-app.tsx` | Chat list + chat window (client) |
| `src/app/login/` | Login page (one shared password for now) |
| `src/app/api/chats/[id]/messages/route.ts` | Sends a message, streams the reply as SSE |
| `src/lib/runner.ts` | Spawns claude-pool: queue, one run per chat, timeout, stop |
| `src/lib/stream-json.ts` | Parses Claude's `stream-json` output |
| `src/db/` | Drizzle schema and connection; migrations in `drizzle/` |
| `src/proxy.ts` | Sends logged-out visitors to `/login` |

## Notes for the Docker image

- Copy `drizzle/` next to the standalone `server.js`: migrations are read from `process.cwd()/drizzle`.
- `better-sqlite3` is a native module: build it in the same base image you run.
- `/api/health` returns `200` once the server is up and SQLite answers.
