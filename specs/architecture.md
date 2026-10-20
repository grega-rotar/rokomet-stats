# Architecture

```
Browser ── HTTPS ──> Cloudflare (proxy) ── HTTPS ──> Caddy ──> Next.js (one container)
                                 ├─ UI (App Router, React)
                                 ├─ POST /api/chats/:id/messages ──spawn──> claude-pool -p (stream-json, prompt on stdin)
                                 ├─ GET  /api/health
                                 └─ SQLite (/data/app.db)
```

## Stack
- **Next.js** (latest stable, App Router, TypeScript), run with `next start` (`output: "standalone"`). Not serverless: each reply is a long-running child process.
- **Node 24 LTS**.
- **SQLite** through Drizzle ORM (`better-sqlite3`). One file, in a Docker volume.
- **Tailwind CSS** for styling.
- **Auth**: see [open-questions.md](open-questions.md). Until decided: one shared password and a session cookie.

## Chat flow
1. The browser POSTs `{ text }` to `/api/chats/:chatId/messages`.
2. The server saves the user message, then spawns:
   ```
   claude-pool -p --output-format stream-json --verbose --include-partial-messages \
     [--resume <claude_session_id>] \
     --system-prompt "<our app prompt>" --system-prompt-snapshot off --disable-slash-commands \
     --setting-sources "" --strict-mcp-config --tools "$CLAUDE_TOOLS" \
     --model "${CLAUDE_MODEL:-sonnet}" --effort low \
     --allowedTools "<allow list, see open questions>"
   ```
   The user's text goes in on **stdin**, never as an argument, so it can't be read as a flag.
   The working directory is a folder for that chat: `/data/work/<chatId>`.
3. The server reads stdout line by line (each line is one JSON event) and forwards the text to the browser as **server-sent events** (SSE).
4. When the first event carrying a `session_id` arrives, the server saves that id on the chat. The next message uses `--resume <session_id>`.
5. On the `result` event, the server saves the full assistant message (text, cost, duration, number of turns) and closes the stream.

## Rules for claude-pool processes
- **Concurrency limit**: at most `MAX_PARALLEL_RUNS` (default 6) at once. Requests over the limit wait in a queue, and the UI shows "waiting…".
- **One run per chat**: a second message sent while a reply is still running gets `409`.
- **Keep-alive**: send an SSE comment (`: ping`) every 20 s while a run is going. Cloudflare closes a request that sends nothing for ~100 s, and Claude can be quiet that long while it works.
- **Timeout**: kill the process after `RUN_TIMEOUT_SECONDS` (default 600).
- **Stop button / tab closed**: when the client disconnects, send SIGTERM to the process.
- **Errors**: a non-zero exit or an `is_error` result is saved as an error message in the chat, so the UI can offer "retry".
- **Account pick**: runs get `CLAUDE_POOL_FRESH=0`, so claude-pool picks an account on its saved usage numbers right away (a check first costs ~3 s per reply). The server runs `claude-pool --pool-refresh` in the background at most every 5 min, when a reply starts.
- Never pass user text through a shell: use `spawn(cmd, args)` with an argument array.

## Data model (SQLite)
| Table | Columns |
|---|---|
| `users` | id, email, password_hash, created_at |
| `chats` | id, user_id, title, claude_session_id, created_at, updated_at |
| `messages` | id, chat_id, role (`user`/`assistant`/`error`), content, cost_usd, duration_ms, created_at |

Claude Code keeps its own conversation files in `~/.claude`. That folder must be in a volume, otherwise `--resume` breaks after every deploy.

## Environment variables
| Name | Example | Purpose |
|---|---|---|
| `DATABASE_PATH` | `/data/app.db` | SQLite file |
| `WORK_DIR` | `/data/work` | Working folders, one per chat |
| `CLAUDE_POOL_DIR` | `/home/app/.config/claude-pool` | Account files (`*.token`, `*.key`) |
| `CLAUDE_POOL_STATE` | `/data/claude-pool-state.json` | Shared usage state |
| `CLAUDE_MODEL` | `sonnet` | Model for replies. `haiku` uses ~15x less account usage if plain chat is all that is needed |
| `CLAUDE_TOOLS` | `` | Tools that exist in a reply (`--tools`). Empty = none, which also keeps ~19k tokens of tool definitions out of every reply |
| `MAX_PARALLEL_RUNS` | `6` | See above |
| `RUN_TIMEOUT_SECONDS` | `600` | See above |
| `AUTH_SECRET` | random 32 bytes | Signs session cookies |
