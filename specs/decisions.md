# Decisions

## Docker: yes
- Deploying becomes "pull an image and restart it". CI builds the image once, the server runs exactly that image, and rolling back means picking an older tag.
- Isolation: Claude can run shell commands. In a container, as a non-root user, it sees only its own volumes, not the host.
- The server stays clean: only Docker is installed on it. Node, Python and the claude CLI live in the image.
- Cost: a bit more setup (volumes for `~/.claude`, the claude-pool accounts and its state). Worth it.

## Cloudflare proxy in front, Caddy on the server
- The domain is on Cloudflare: it gives visitors the certificate, hides the server IP and blocks junk traffic.
- Caddy terminates the Cloudflare Origin Certificate (SSL mode Full (strict)), so traffic is encrypted all the way to the server.
- Caddy, not Traefik: one app on one server needs a 4-line Caddyfile. Traefik pays off only when many containers come and go and are routed through Docker labels.
- Not a Cloudflare Tunnel: not needed. The Hetzner Cloud Firewall only lets Cloudflare reach port 443.
- Cost: Cloudflare's ~100 s idle timeout, handled with SSE keep-alive pings.

## Next.js, one app
- UI and API in one codebase and one container. The API is small (chats, messages, streaming).
- Runs with `next start` in a container, not on Vercel or another serverless host, because each reply is a long-running child process.

## SQLite
- One server, few writes, nothing extra to run. The file lives in a volume and is backed up nightly.
- Move to Postgres only if we ever need more than one app server.

## claude-pool through the CLI, not the Agent SDK
- claude-pool is a drop-in replacement for `claude`: it rotates accounts and reruns a reply that hit a usage limit. Spawning it gives us that for free.
