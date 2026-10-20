# Push notifications

Status: built (branch `push-notifications`). PRD with acceptance criteria: [`tasks/prd-push-notifications.md`](../tasks/prd-push-notifications.md).

A device (a phone or a browser) can get a Web Push notification when a new result is in `stats.db`. There are no user accounts, so all settings belong to a device.

```
crawler ──> stats.db ──read-only──> notifier (timer in the app process, every PUSH_POLL_SECONDS)
                                       │  new matches: newest season, last PUSH_WINDOW_DAYS days, not in push_sent
                                       │  recipients:  all_top devices · followed teams · followed players
                                       └──> web-push (VAPID) ──> browser push service ──> public/sw.js ──> notification
```

## What a device can choose
- **All top-league results** (`competitions.category = 'top'`: NLB, 1. SRL).
- **Follow a team** (Follow button on `/stats/teams/[id]`). Team ids are per season in the RZS API, so a follow lasts one season.
- **Follow a player** (Follow button on `/stats/players/[id]`). The push names the player's line: "Name: 9 goals (9/12)".

Settings page: `/stats/alerts` (on/off, the top-league switch, the list of follows, a test button).

## Data (app.db, migration `drizzle/0001_push.sql`)
| Table | Columns |
|---|---|
| `push_devices` | id (random), endpoint (unique), p256dh, auth, all_top, user_agent, created_at, last_sent_at, failures |
| `push_follows` | device_id → push_devices (cascade), kind `team`/`player`, ref_id, label; PK (device_id, kind, ref_id) |
| `push_sent` | match_id (PK), sent_at: each match is announced once, written **before** sending |

## Routes (all behind the login, like the rest)
| Route | What |
|---|---|
| `GET /api/push` | `{publicKey}` (null when VAPID isn't set up) |
| `POST /api/push/devices` | `{subscription}` → upsert by endpoint → `{device:{id, allTop, follows}}` |
| `PATCH` / `DELETE /api/push/devices/[id]` | `{allTop}` / turn off |
| `PUT` / `DELETE /api/push/devices/[id]/follows` | `{kind, refId, label}` / `{kind, refId}` |
| `POST /api/push/devices/[id]/test` | one test push |

Public without a login (`src/proxy.ts`): `/sw.js`, `/manifest.webmanifest`, `/icon/*`, `/apple-icon*`.

## Rules
- First run and first deploy: only matches dated within the window count, and the notifier marks them sent even when nobody is subscribed, so nobody gets a flood of old results.
- More than 3 pushes for one device in one run → one summary ("5 new results").
- 404/410 from the push service → the device is deleted. Other errors → `failures + 1`; 10 in a row → deleted.
- The notifier only starts when `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set.
- iPhone: push only works after "Share → Add to Home Screen" (iOS 16.4+). The alerts page says so.

## Config (`.env`)
| Name | Default | |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | none | `npx web-push generate-vapid-keys` once; never change them, or every device has to subscribe again |
| `VAPID_SUBJECT` | `mailto:admin@rokomet.local` | contact for the push services |
| `PUSH_POLL_SECONDS` | 120 | how often the notifier checks stats.db |
| `PUSH_WINDOW_DAYS` | 3 | how old a match may be and still be announced |

## Not yet
- Fixture reminders (the crawler doesn't store scheduled matches).
- Faster results: the crawler runs every 6 h, so a push can come up to 6 h after the final whistle.
