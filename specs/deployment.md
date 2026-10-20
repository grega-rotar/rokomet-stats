# Deployment (GitHub Actions)

## Flow
On every push to `main` (and by hand with `workflow_dispatch`):

1. **check**: `npm ci`, lint, typecheck, tests, `next build`.
2. **image**: build the Docker image and push it to GHCR as
   `ghcr.io/grega-rotar/rokomet-stats:<git sha>` and `:latest` (log in with the built-in `GITHUB_TOKEN`, permission `packages: write`).
3. **deploy**: SSH to the server as `deploy` and run:
   ```
   cd /srv/rokomet-stats
   IMAGE_TAG=<git sha> docker compose pull app
   IMAGE_TAG=<git sha> docker compose up -d app
   ```
   Then poll `https://rokomet.etiam.si/api/health` for up to 60 s, and fail the job if it never returns `200`.
4. Database migrations run when the app starts (Drizzle `migrate()`), before the app starts listening.

Pull requests run only the **check** job.

Deploys use a `concurrency: deploy` group, so two deploys never run at the same time.

## Repository secrets
| Secret | Value |
|---|---|
| `DEPLOY_HOST` | server IP or hostname |
| `DEPLOY_SSH_KEY` | private key whose public half is in `~deploy/.ssh/authorized_keys` |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan <host>`, so the host key gets checked |

The repo is public, so the GHCR package is public too (set once in the package settings after the first push). The server pulls without logging in.
Because the image is public, it must never contain secrets: account files, `.env` and certificates only come in through volumes on the server.

## Rollback
Run the workflow by hand with the input `tag=<older sha>`: it skips the build and runs only the deploy step with that tag. Or, on the server: `IMAGE_TAG=<sha> docker compose up -d app`.

## Downtime
`up -d` restarts the container, so each deploy causes a few seconds of downtime and cuts off any replies still running. That's fine for now; revisit it if it starts to matter.
