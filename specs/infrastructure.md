# Infrastructure

## Server
- Domain: `rokomet.etiam.si` (zone `etiam.si` on Cloudflare).
- SSH alias: `t4a` (root) → `77.42.42.60` (Hetzner). Hostname `time-4-action-production`.
- Ubuntu 26.04 LTS, 4 vCPU, 7.6 GB RAM, 75 GB disk. Empty as of 2026-10-20 (only SSH running).
- Capacity: one `claude` process uses about 200–400 MB RAM, so roughly 10–15 runs fit at once. `MAX_PARALLEL_RUNS=6` leaves headroom.

## Traffic: Cloudflare proxy + Caddy
```
Browser ── HTTPS (Cloudflare cert) ──> Cloudflare ── HTTPS (Origin cert) ──> Caddy :443 ──> app:3000
```
- DNS on Cloudflare: an `A` record `rokomet.etiam.si` → `77.42.42.60`, **proxied** (orange cloud).
- SSL/TLS mode: **Full (strict)**. "Always Use HTTPS": on.
- Caddy uses a **Cloudflare Origin Certificate** (SSL/TLS → Origin Server → Create certificate, 15 years). Save it as `certs/origin.pem` and `certs/origin.key` on the server. Caddy does not request certificates itself.
- **Gotcha: 100 s timeout.** Cloudflare closes a request that sends no bytes for ~100 s. The chat stream sends an SSE comment (`: ping`) every 20 s (see [architecture.md](architecture.md)).
- The visitor's real IP is in the `CF-Connecting-IP` header. Use it for logs and rate limits.

## Firewall (Hetzner Cloud Firewall, not ufw)
Ports published by Docker bypass ufw, so the firewall lives in Hetzner's console, in front of the server:
| Port | From |
|---|---|
| 22/tcp | anywhere (GitHub Actions deploys over SSH; key-only login) |
| 443/tcp | only Cloudflare's IP ranges (https://www.cloudflare.com/ips/) |
Everything else inbound is blocked. Port 80 is not needed: Cloudflare redirects HTTP to HTTPS.

## One-time setup (as root, by hand or with a script in `infra/`)
1. `apt update && apt upgrade`, and enable `unattended-upgrades`.
2. Install Docker Engine and the Compose plugin (from Docker's official apt repo).
3. Create a user `deploy`, add it to the `docker` group, and put the GitHub Actions public key in `~deploy/.ssh/authorized_keys`.
4. SSH hardening: `PasswordAuthentication no`. Keep root login key-only until `deploy` works, then decide whether to turn root login off.
5. Hetzner Cloud Firewall as above, attached to this server.
6. `mkdir -p /srv/rokomet-stats` (owned by `deploy`), holding `compose.yml`, `Caddyfile`, `.env` and `certs/`.
7. Copy the claude-pool account files into `/srv/rokomet-stats/claude-pool/` (mode `600`, owned by uid 1000, which is the `app` user inside the container).
8. Cloudflare: DNS record, SSL mode and Origin Certificate as above.

## Containers (`compose.yml`)
| Service | Image | Ports | Volumes |
|---|---|---|---|
| `caddy` | `caddy:2` | 443 | `./Caddyfile`, `./certs:/certs:ro`, `caddy_data` |
| `app` | `ghcr.io/grega-rotar/rokomet-stats:<sha>` | none (only `caddy` reaches it, on port 3000) | `app_data:/data`, `claude_home:/home/app/.claude`, `./claude-pool:/home/app/.config/claude-pool:ro` |

The `app` image contains Node 24, `python3`, the `claude` CLI (`@anthropic-ai/claude-code`) and the `claude-pool` script. It runs as the non-root user `app` (uid 1000), never as root, because Claude can run commands.

Both services use `restart: unless-stopped`. `app` has a `healthcheck` on `GET /api/health`.

## Caddyfile
```
{$DOMAIN} {
    tls /certs/origin.pem /certs/origin.key
    encode zstd gzip
    reverse_proxy app:3000
}
```
SSE streaming needs no extra settings, because Caddy flushes `text/event-stream` responses immediately.

## Backups
A nightly cron job on the host runs `sqlite3 .backup` on `app.db` and keeps 14 copies in `/srv/rokomet-stats/backups`. Off-server copies: still to decide.
