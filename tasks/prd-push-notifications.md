# PRD: Push notifications for new results

## 1. Introduction

Users open the site to check whether a match has finished. With push notifications, the phone tells them: "RK Celje Pivovarna Laško 31:28 RD Riko Ribnica · 1. NLB liga". They choose what to get (all top-league results, or only teams and players they follow), per device. No native app: the site becomes an installable PWA and uses standard Web Push (VAPID), which works in Chrome, Edge, Firefox and Safari, on Android and desktop, and on iPhone once the site is added to the home screen (iOS 16.4+).

Spec: [`specs/notifications.md`](../specs/notifications.md).

## 2. Goals
- A user can turn on notifications on a device in 2 clicks (button → browser permission prompt).
- A user can follow a team or a player from its stats page with one click.
- A new result reaches subscribed devices at most `PUSH_POLL_SECONDS` (default 120 s) after the crawler writes it to `stats.db`.
- No device gets the same match twice; no device gets more than 3 separate pushes per notifier run (more are bundled into one summary).
- Turning on notifications for the first time, or deploying for the first time, never sends old results.

## 3. Decisions taken (no clarifying round: the user asked for a one-shot build)
| Question | Decision | Why |
|---|---|---|
| What triggers a push? | A **new finished match** in `stats.db` (current season, match date in the last 3 days, not sent before). | That is what the crawler produces today. Fixtures (`status = 0`) are not stored, see Non-goals. |
| Who gets it? | Per **device** (a push subscription). There are no user accounts (`specs/open-questions.md`: shared password). | Each phone or browser has its own settings. |
| What can a device follow? | (a) "All top-league results" (`competitions.category = 'top'`: NLB, 1. SRL), (b) teams, (c) players. | Teams and players are what the stats pages already show. |
| Where does sending run? | Inside the `app` container: a timer started in `src/instrumentation.ts` reads `stats.db` (read-only) and `app.db`. | The crawler stays a pure data job ("code extracts"). No new container, and `web-push` runs in Node. |
| Library | `web-push` 3.6.7 (+ `@types/web-push`). | The standard VAPID/aes128gcm implementation; writing the encryption ourselves is risk without benefit. |
| Crawl interval | Unchanged (6 h). | Polling RZS more often is a separate decision about load on their API (Open questions). |
| UI prototype | **No prototype (user asked for a one-shot build).** The UI reuses the existing `Card`, `PageTitle` and button styles from `src/app/stats/ui.tsx` and `drills.tsx`. | |

## 4. User stories

### US-001: Store devices, follows and sent matches
**Description:** As the system, I need to remember which devices want which pushes, and which matches were already announced.

**Acceptance criteria:**
- [unit] Migration `0001_push` creates `push_devices` (id text PK, endpoint unique, p256dh, auth, all_top int default 0, user_agent, created_at, last_sent_at, failures int default 0), `push_follows` (device_id FK → push_devices ON DELETE CASCADE, kind `team`|`player`, ref_id, label, PK (device_id, kind, ref_id)) and `push_sent` (match_id PK, sent_at).
- [unit] Saving the same subscription endpoint twice leaves exactly 1 row in `push_devices` and returns the same id both times.
- [unit] Deleting a device removes its rows in `push_follows` (cascade).

**Verification:** `src/lib/push/store.test.ts` (temp SQLite file, real migrations). Regression risk: `runMigrations()` at startup; the chats tables.

### US-002: Turn notifications on or off on a device
**Description:** As a user, I want to turn on notifications on this phone, check that it works, and turn it off again.

**Acceptance criteria:**
- [unit] `POST /api/push/devices` with `{subscription:{endpoint:"https://push.example/abc",keys:{p256dh:"…",auth:"…"}}}` returns 200 with `{device:{id, allTop:false, follows:[]}}`. A body without `endpoint` or keys returns 400 `{error:"Invalid subscription."}` and creates no row.
- [unit] `PATCH /api/push/devices/{id}` with `{allTop:true}` sets `all_top = 1`. An unknown id returns 404.
- [unit] `DELETE /api/push/devices/{id}` returns 204 and the row is gone.
- [unit] `POST /api/push/devices/{id}/test` sends exactly one push with title `Notifications are on` to that device's endpoint.
- [unit] With `VAPID_PUBLIC_KEY` unset, `GET /api/push` returns `{publicKey:null}` and the notifier timer does not start.
- [browser] `/stats/alerts` with no subscription shows the card "Notifications on this device" with the button `Turn on notifications`. With permission `denied` it shows `Notifications are blocked for this site` and no button. On iPhone Safari outside the home screen it shows `Add Rokomet stats to your home screen first`.
- [browser] After turning on: the page shows `On`, the `All top-league results` switch, `Send test notification` and `Turn off on this device`, with zero console errors.

**Verification:** `src/lib/push/store.test.ts`, `src/lib/push/send.test.ts` (local HTTP server as the push service). dev-browser: `/stats/alerts` in the states above (permission is faked with `Notification.permission` overrides where the headless browser can't grant it). Regression risk: the proxy (new public paths), the stats layout nav.

### US-003: Follow a team or a player
**Description:** As a user, I want a Follow button on team and player pages so that I get only the results I care about.

**Acceptance criteria:**
- [unit] `PUT /api/push/devices/{id}/follows` with `{kind:"team", refId:4042, label:"RK Krim OTP Group Mercator Ljubljana"}` adds 1 row; sending it again still leaves 1 row. `kind:"club"` returns 400.
- [unit] `DELETE /api/push/devices/{id}/follows` with `{kind:"team", refId:4042}` removes it.
- [browser] `/stats/teams/4042` shows a `Follow` button next to the title. Clicking it (permission granted) changes it to `Following`, and `/stats/alerts` then lists `RK KRIM OTP GROUP MERCATOR LJUBLJANA` under "Following" with a `Remove` button.
- [browser] `/stats/players/{id}` has the same button and behaviour.

**Verification:** `src/lib/push/store.test.ts`; dev-browser flow on team 4042. Regression risk: team and player page headers.

### US-004: Send pushes for new results
**Description:** As a user, I want a push shortly after a followed team's match is in the stats.

**Acceptance criteria:**
- [unit] `planPushes()` with 1 new top-league match (home team 4042), device A (all_top), device B (follows team 4042), device C (follows team 9999) returns exactly 2 pushes, for A and B; none for C.
- [unit] A device following player 77 who scored 9 from 12 shots in the match gets body text containing `9 goals (9/12)` and a URL of `/stats/players/77`.
- [unit] A device that would get 5 pushes in one run gets 1 push titled `5 new results` with 3 score lines plus `+2 more`.
- [unit] `newMatches()` ignores a match from season 72 when season 73 exists, ignores a match dated 5 days ago (window 3 days), and ignores a match already in `push_sent`.
- [unit] After one run, every candidate match is in `push_sent` (even with 0 recipients), and a second run sends 0 pushes.
- [unit] A push service answering 410 deletes that device; an answer of 500 increments `failures` and keeps it.
- [unit] Payload JSON is `{title, body, url, tag}`, with `tag = "match-<id>"` for a single result.

**Verification:** `src/lib/push/plan.test.ts`, `src/lib/push/notifier.test.ts` (temp app.db + temp stats.db + local HTTP push endpoint). Regression risk: the stats.db read-only handle; app startup.

### US-005: Installable app (PWA)
**Description:** As an iPhone user, I need the site installable so that iOS allows push.

**Acceptance criteria:**
- [browser] `GET /manifest.webmanifest` returns 200 without a session cookie, with `display:"standalone"`, `start_url:"/stats"`, and icons of 192 and 512 px.
- [browser] `GET /sw.js` returns 200 without a session cookie, with `Content-Type` JavaScript.
- [browser] `GET /icon/192` and `/apple-icon` return PNGs without a session cookie.
- [unit] The service worker's `push` handler calls `showNotification(title, {body, tag, data:{url}})`, and `notificationclick` opens `data.url`.

**Verification:** curl checks; the service worker is checked by reading it in review (it runs only in a browser). Regression risk: the proxy's login redirect.

## 5. Functional requirements
- FR-1: `push_devices`, `push_follows` and `push_sent` exist in `app.db` (Drizzle migration `0001_push`).
- FR-2: `GET /api/push` returns `{publicKey}` from `VAPID_PUBLIC_KEY`, or `null` when not set.
- FR-3: `POST /api/push/devices` upserts by endpoint and returns the device state `{id, allTop, follows:[{kind, refId, label}]}`.
- FR-4: `PATCH|DELETE /api/push/devices/[id]`, `PUT|DELETE /api/push/devices/[id]/follows` and `POST /api/push/devices/[id]/test` act on one device; an unknown id → 404. All push routes need the session cookie (like every other route).
- FR-5: The notifier runs every `PUSH_POLL_SECONDS` (default 120) inside the app process, only when VAPID keys are set, and never overlaps itself.
- FR-6: A candidate match is: `status = 1`, `season_id` = the newest season in `stats.db`, date within `PUSH_WINDOW_DAYS` (default 3) of today, and not in `push_sent`.
- FR-7: Recipients: devices with `all_top = 1` for a `top` competition match; devices following the home or away team id; devices following a player with a `player_match` row in the match.
- FR-8: Every candidate is written to `push_sent` before sending (at most once: a crash never re-sends).
- FR-9: More than 3 pushes for one device in one run → one summary push.
- FR-10: 404/410 from the push service → delete the device. Other errors → `failures + 1`; a device with 10 failures in a row is deleted.
- FR-11: `/manifest.webmanifest`, `/sw.js`, `/icon/*` and `/apple-icon*` are public in `src/proxy.ts`.
- FR-12: The stats nav has an `Alerts` link to `/stats/alerts`.

## 6. Non-goals
- Fixture reminders ("plays tomorrow"): the crawler doesn't store scheduled matches.
- Live score pushes during a match, or crawling more often than every 6 h.
- Push in the chat (e.g. "your answer is ready").
- Following across seasons: team ids are per season in the RZS API, so a follow is for that season's team.
- Email or SMS.

## 7. Design
- **Prototype:** no prototype (user asked for a one-shot build).
- Reuse: `Card`, `PageTitle`, `Empty` (`src/app/stats/ui.tsx`); the lime `bg-court` button from `drills.tsx`; rounded-xl buttons, no skewed shapes (memory: UI style).
- The Follow button is a small rounded pill with a bell icon: outline `Follow`, filled sky blue `Following`.

## 8. Technical notes
- VAPID keys: `npx web-push generate-vapid-keys`, stored in the server `.env` as `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:…`.
- The service worker is a static file in `public/` (and so in git). The Dockerfile already copies `public/`.
- Push payloads stay under 4 KB; TTL 24 h.

## 9. Success metrics
- A followed team's result shows on the phone within 2 minutes of the crawler loading it.
- 0 duplicate pushes per match per device.

## 10. Open questions
- Crawl more often on match days (e.g. every 15 min for the current round only)? That makes pushes timely, but it adds load on the RZS API.
- Fixture reminders need the crawler to store `status = 0` matches.

## 11. Verification checklist

### Per-change coverage
**Devices (subscribe / settings / unsubscribe)**
- [ ] Frontend: `/stats/alerts` states: unsupported, iOS needs home screen, blocked, off, on.
- [ ] Validation: bad subscription → 400; unknown device → 404.
- [ ] Storage: endpoint, keys, all_top saved; upsert keeps 1 row.
- [ ] Round-trip: turn on → reload → still shows On (looked up from `pushManager.getSubscription()`).
- [ ] Scoping: N/A, there are no user accounts; a device is addressed by its random id, behind the login.

**Follows**
- [ ] Frontend: Follow/Following button on team and player pages.
- [ ] Validation: kind other than team/player → 400.
- [ ] Round-trip: follow → `/stats/alerts` lists it → Remove → gone.

**Notifier**
- [ ] Divergent data: 3 devices, 2 recipients (A all_top, B team), C gets nothing.
- [ ] Edge: old season, outside the window, already sent, 410 endpoint, bundling over 3.

### Test data
Unit tests build temp `app.db` and `stats.db` files: season 72 + 73; match 1 (73, top, today, teams 4042 vs 4060, player 77 with 9/12); match 2 (73, 5 days ago); match 3 (72, today); 5 extra top matches today for the bundling case.

### Browser end-to-end
- [ ] `/stats/alerts`, `/stats/teams/4042` and a player page at 1440 px and 390 px, zero console errors.
- [ ] Manifest, sw.js and icon routes return 200 without a cookie.

### Suite gates
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.
