# Diagrams

These show the target state. Parts of it (the crawler container, the stats pages, `/api/stats/*`) are still being built.

Colours: lime = our components, slate = infrastructure, sky = data stores, grey = external services.

## infrastructure.drawio
The network path and what runs where. The browser goes through Cloudflare (proxy, HTTPS) to server t4a, then to the Caddy container on :443 (Cloudflare origin cert), which proxies to the app container on :3000. Inside the app: UI pages, API routes, SQLite access, `claude-pool -p` and the read-only query scripts. Next to it is the crawler container. Below them are the volumes (`app_data`, `claude_home`, the claude-pool accounts bind, `caddy_data`/`caddy_config`, certs). Outside the server: the RZS API, Anthropic (through claude-pool), GHCR and GitHub Actions.

## data-pipeline.drawio
How handball data gets into `stats.db`. Every 6 hours `scripts/crawl.py` calls the RZS public API, stores raw responses in the gzipped cache, and runs the parsers (including `parse_zones.py` for PDF goal zones). Each match then goes through four checks. Passing matches are written to `stats.db`. Failing ones get a row in the `checks` table and go to review, and after a parser fix the data is rebuilt from the cache. The bottom part shows how the stats pages (through `/api/stats/*`) and the chat (through `claude-pool` and `scripts/query.py` / `scripts/players.py`) read `stats.db` read-only.

## deploy.drawio
CI/CD from `.github/workflows/deploy.yml`. A push to `main` runs **check** (lint, typecheck, test, build), then **image** (pushes `ghcr.io/grega-rotar/rokomet-stats:<sha>` to GHCR), then **deploy**: SSH in as `deploy`, scp `compose.yml` and `Caddyfile`, run `docker compose pull` and `up -d`, and poll `https://rokomet.etiam.si/api/health`. Pull requests only run check. A manual run with `tag=<sha>` deploys only, which is how you roll back.

## Opening them
- In the browser: go to [app.diagrams.net](https://app.diagrams.net), then **File → Open** and pick the `.drawio` file.
- In VS Code: install the **Draw.io Integration** extension (`hediet.vscode-drawio`) and open the file.
