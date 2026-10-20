# rokomet-stats specs

A web app with a chat UI. Each chat message is answered by Claude, run through `claude-pool` on our own server.

| File | What it covers |
|---|---|
| [architecture.md](architecture.md) | How the app works: UI, API, claude-pool, storage |
| [infrastructure.md](infrastructure.md) | The server, Docker, Cloudflare + Caddy, firewall, folders |
| [deployment.md](deployment.md) | GitHub Actions: build, push, deploy, rollback |
| [decisions.md](decisions.md) | What we chose and why (Docker, Cloudflare + Caddy, Next.js, SQLite) |
| [data-source.md](data-source.md) | Where the handball data comes from: RZS public API, stats PDFs, goal zones |
| [open-questions.md](open-questions.md) | Still to decide |

## MVP is done when
1. Opening `https://rokomet.etiam.si` shows a login page; after logging in, a chat list and a chat window.
2. Sending a message streams Claude's answer into the chat as it is written.
3. A follow-up message in the same chat remembers the earlier messages (same Claude session).
4. Reloading the page shows all chats and their messages.
5. A push to `main` deploys to the server automatically, and `/api/health` returns `200` afterwards.
6. If one claude-pool account is out of usage, chats keep working on the next account.
