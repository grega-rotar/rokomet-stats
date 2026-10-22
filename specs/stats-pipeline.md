# Stats pipeline (part of the app)

The handball data collection is built into the app. Data source details: [data-source.md](data-source.md). Diagrams: [docs/diagrams](../docs/diagrams/README.md).

```
RZS API ──> crawler container ──> parsers ──> checks ──> /data/stats.db ──read-only──> stats pages + chat Claude
                                                 └──> checks table (one row per match per check)
then scripts/review.py:  failed checks ──rules──> reviews (source 'rule')
                         the rest, with a cached PDF ──picture──> claude-pool ──> reviews (source 'ai')
                         weekly sample ──picture──> claude-pool ──JSON──> audits (compared in code)
```

## Principles
- **Code extracts, AI explains.** Every number in `stats.db` comes from code. Claude only reads it (pages, chat, drills) and never writes numbers into it. The one place Claude's output is stored is `scripts/review.py`: its one-line reason goes in `reviews.reason`, and what it read off a picture goes in `audits.ai_value` next to the number code stored. Nothing Claude says changes the data tables or `checks`.
- **The crawler is not the chat agent.** It runs on a schedule in its own container; chat and pages only read the result.
- **Match data is cached** (gzipped API responses in `/data/cache`, keyed by URL), so the database can be rebuilt after a parser fix without asking RZS again. Season, league and round lists are always fetched fresh, so new matches show up.
- About 1 request per second per crawler process, 3 processes. Finished matches are never fetched twice.

## Pieces
| Piece | Where | What it does |
|---|---|---|
| Crawler | compose service `crawler`, same image as `app`, runs `scripts/crawler-loop.sh` | Every 6 h (`CRAWL_INTERVAL_SECONDS`): copies `scripts/chat-CLAUDE.md` to `/data/work/CLAUDE.md`, crawls the current season with `CRAWL_SHARDS` (3) parallel `scripts/crawl.py` processes, then every past season once (`CRAWL_HISTORY=all`, newest first, marker file `/data/crawl-<id>.done`). Before 2019/20 RZS has results and goals per player only (`matches.detail = scorers`, shots stored as NULL). A match whose detail, players, play-by-play or PDF got an RZS error (`fetch_*` check) is retried on the next run. Progress per process: `crawl_progress` table, shown on `/stats/crawl` (refreshes every 15 s). |
| `stats.db` | `/data/stats.db` in the `app_data` volume, WAL mode, separate from `app.db` | seasons, competitions, matches (played only, `status = 1`), player_match, goalkeeper_match, events (play-by-play), team_zones, team_shooting, player_shot_types, checks, crawl_progress (live state per crawler process), crawl_runs (one row per crawler process: started_at, finished_at, season_id, matches_new, errors). Schema in `scripts/crawl.py`; `reviews` and `audits` in `scripts/review.py`. |
| Clubs | `scripts/clubs.py [season\|current]` → `clubs`, `team_clubs`, `postcodes` | Per competition `podatkiLiga/{league}/sezona/{season}/klubi` (cached, 1 request/s): club id, name, street, postcode, town. Contact names, phones and e-mails are not stored. `lat`/`lon` = the postcode centre from `scripts/data/si_postcodes.csv`. `team_clubs(team_id, season_id, competition_id, club_id)` from that list plus `home_club_id`/`away_club_id` of the matches. 2026/27: 66 clubs, all with coordinates. |
| Checks | `scripts/crawl.py` → `checks` table | Per match: player goals = score; play-by-play final = score; PDF score = score; goal zones + 7m = score (per team). A failed check is stored with its detail; the match is still loaded. `load` is stored only when a match fails to load, and deleted once it loads. |
| Shot types | `scripts/crawl.py` (`load_shot_types`) with `scripts/parse_players.py` | Deep matches: the PDF player table into `player_shot_types`, tied to `player_match.player_id` by side + shirt number (fallback: name; goalkeepers by name from `goalkeeper_match`). A team's rows are kept only when its typed PDF goals are within max(2, 10%) of its score (some clubs log only 7m). Backfill from the cache without network: `python3 scripts/crawl.py --reparse [SEASON_ID]` (also refills team_zones and team_shooting). |
| Review | `scripts/review.py`, run by `crawler-loop.sh` after each crawl | See "Review and audit" below. Writes only `reviews` and `audits`. |
| Data page | `/stats/data` (`src/lib/stats/quality.ts`) | Coverage per season and competition (matches, % with play-by-play, % with zones), check pass rates, failed checks with their review, the latest audit, the last crawl runs. |
| Stats pages | `/stats` (standings, results, top scorers, player search), `/stats/players/[id]` (profile vs position average, weak spots, shot types, match by match, similar players, drills button), `/stats/teams/[id]` (Elo rating, last-5 form, next matches with win chance, goal zones, squad, matches), `/stats/rankings`, `/stats/teams` (Elo table per competition: rating, change over the last 5, form, season sparkline, upcoming matches), `/stats/near` (clubs by distance from a town, postcode or the browser's location, on an SVG map of Slovenia) | Server components reading `stats.db` through `src/lib/stats/`. |
| Drills | `POST /api/stats/players/[id]/drills` | One `claude-pool` run with the player's numbers in the prompt; returns a Markdown training plan. |
| Chat panel | `src/app/(app)/stats/chat-panel.tsx` | "Ask" in the stats top bar opens a chat next to the page (docked on wide screens, a bottom sheet on phones), using the chat parts from `src/app/chat/`. A player or team page sets the context with `<AskAbout>`: one-tap questions, and the first message names the player/team id. |
| Diagrams | `/diagrams` (`src/app/(app)/diagrams/`) | The draw.io files in `docs/diagrams` (copied into the image) rendered with the diagrams.net viewer, plus a download link. |
| Chat tools | chat Claude, `CLAUDE_ALLOWED_TOOLS` in `infra/compose.yml` | `python3 /app/scripts/query.py "SELECT …"` (read-only SQL) , `python3 /app/scripts/players.py …` and `python3 /app/scripts/teams.py elo|predict|validate|near …`. Instructions: `scripts/chat-CLAUDE.md`. |

## Weak spots, similar players, rankings (same rules in `players.py` and `src/lib/stats/queries.ts`)
- Compared with players of the **same position in the same competitions**.
- Weak spot only with enough attempts: field shooting needs 15+ field shots and 8+ points below average; 7m needs 6+ attempts and 12+ points below; discipline needs 4+ matches and more than max(0.5, 2× average) suspensions per match.
- Shot types (PDF): goals, shots and saves come from the JSON (`player_match`); the PDF gives only the split by type, and each type's % is goals/shots of that PDF column. A 6m / wing / 9m weak spot needs 15+ attempts of that type and 10+ points below the position average (7m keeps its JSON rule). Under 15 attempts the numbers are shown as a small sample. Rules in `src/lib/stats/shot-types.ts` and `scripts/players.py`.
- Similar players: z-scored fingerprint (goals/match, shots/match, field %, 7m share of shots, suspensions/match), Euclidean distance, +0.75 for a different position, same season, 15+ shots.
- Rankings: shooting % shrunk toward the average by 20 shots (15+ shots); 7m % by 5 attempts (5+ attempts); 9m / 6m / wing % (PDF) by 15 attempts (15+ attempts of that type), toward the average of the filtered players.

## Review and audit (`scripts/review.py`)
`python3 scripts/review.py [all|triage|ai|audit] [--dry-run] [--force-audit] [--match ID]`. The crawler runs `all`. `--dry-run` renders the pictures and prints the prompts without calling Claude.

1. **Triage (rules, no AI).** Each failed check gets a `kind` and a reason when code can decide it:
   - `server_error`: RZS HTTP 5xx, retried on the next crawl.
   - `goalkeeper_goal`, `player_missing`, `player_short`: the play-by-play credits the missing goals to a player the table lacks.
   - `goal_not_credited`: no play-by-play, and the players sum to score − 1..3.
   - `no_player_rows`: a registered result.
   - `goals_without_zone` (1–3 goals) and `partial_zones` (more than 3).
   - `team_no_zones`, and `competition_no_zones` when under half the team sheets in the competition have zones.
   - `grid_has_7m`: the grid equals the score, so the 7m goals are already in it.
   - `no_pdf`, and `unexplained` when no rule fits and there is no PDF.

   A review is deleted once its check passes or its detail changes.
2. **AI review.** Only for checks that no rule explains and that have a cached PDF. PyMuPDF renders the relevant clip to one PNG (the team's goal grid plus its totals row, or both player tables). `claude-pool -p` then gets a prompt with the check, the numbers code read, and the JSON player goals. Claude may only `Read` that one file (`--tools Read`, `--permission-mode dontAsk`), with `--max-turns 4` and a `REVIEW_TIMEOUT_SECONDS` timeout. The first line of the reply is stored as `reviews.reason` (source `ai`, plus the model). At most `REVIEW_MAX_RUNS` per run; the rest wait for the next crawl.
3. **Weekly audit.** `AUDIT_SAMPLE` random matches that have zones and a PDF and haven't been audited yet. From one picture, Claude reads both goal grids and both `Skupaj` rows (goals, 7m) and returns JSON. Code then compares 42 numbers per match with `team_zones`, `team_shooting` and the score. Marker file: `/data/audit.last`.

| Table | Columns |
|---|---|
| `reviews` | match_id, check_name, reason, detail (the check's detail when it was reviewed), source `rule`/`ai`, model, created_at, kind. PK (match_id, check_name) |
| `audits` | match_id, field (e.g. `home.top_left.goals`, `away.7m.shots`, `home.goals`), db_value, ai_value, ok, created_at. PK (match_id, field) |

| Env | Default | |
|---|---|---|
| `CLAUDE_BIN` | `claude-pool` | falls back to `claude` when it isn't on PATH |
| `REVIEW_MODEL` | `sonnet` | passed as `--model`; empty = the CLI default |
| `REVIEW_MAX_RUNS` | 20 (compose: 0, AI review off to save tokens) | AI reviews per run |
| `REVIEW_TIMEOUT_SECONDS` | 180 | per Claude run |
| `AUDIT_SAMPLE` | 10 (compose: 0, audit off) | matches per audit |
| `AUDIT_EVERY_DAYS` | 7 | |

**Where it runs:** in the crawler container, right after each crawl, so reviews never lag behind the data. The `claude-pool` accounts are mounted read-only into `crawler`, the same way as into `app` (`infra/compose.yml`). Both containers share `/data/claude-pool-state.json`, so the review sees the same usage numbers as chat. The image installs `python3-fitz` (Debian bookworm, PyMuPDF 1.21); the script tries `import pymupdf` first and falls back to `import fitz`.

First run on 2026/27 (172 failed checks): rules explained 150 (43 goals without zone, 28 goals not credited, 22 teams without zones, 22 RZS 500s, 15 grids that hold the 7m, 11 goalkeeper goals, 6 partial zones, 1 registered result). 1 had no rule and no PDF, and 21 were left for the AI (mostly zones + 7m above the score).
## Team Elo (same algorithm in `src/lib/stats/elo.ts` and `scripts/teams.py`)
- Played matches (`status = 1`) in date order. Start 1500. Expected home score = 1 / (1 + 10^(−(home − away + HFA)/400)).
- Change = K × margin × (result − expected), K = 30, result 1 / 0.5 / 0. Margin = ln(|goal difference| + 1) × 2.2 / (0.001 × winner's rating lead + 2.2) (damped when the favourite wins, FiveThirtyEight-style); 1 for a draw.
- Home advantage HFA is fitted from the data on every run: the home score rate s over league matches (no cups), HFA = 400 × log10(s / (1 − s)). 2026/27: s = 0.556 → **+44**.
- **One rating per team id per pool.** A pool is the age/gender group in the last brackets of the competition name (`Člani`, `Članice`, `M20`, `Ž15`, …), so a team's league, play-off stage and cup games all move the same rating, and cup games link the divisions. Team ids are stable across seasons and competitions (data-source.md).
- Lower divisions start lower: 100 points per division below the top of the pool (Liga NLB 1500, 1. B SRL 1400, 2. SRL 1300; regional youth groups of the same level start equal). A team only seen in the cup starts one step below the lowest division.
- New season: rating = seed + ⅔ × (last season's rating − seed), i.e. pulled a third back to the start value of its current division.
- Why these numbers (`python3 scripts/teams.py validate`, 2026/27, 632 matches, 601 with a winner): the higher-rated side after home advantage won **70.5%** (home team: 55.9%); Brier score (draw = 0.5) **0.200** vs 0.235 for a constant home-win rate. Matches where both teams already had 3+ games: 237 matches, 74.3% vs 55.3%, Brier 0.186 vs 0.236. A grid over K 10–40 and level step 0–150 improved steadily with larger K (K 20: 66%, K 40: 71%) because one season starts everyone at the seed; K = 30 is the top of the usual handball range. The 100-point division step beats 0 (no step) at every K.

## Coordinates and map (licences)
- `scripts/data/si_postcodes.csv` (postcode, place, lat, lon): from the GeoNames postal code dump `SI.zip` (https://download.geonames.org/export/zip/), **CC BY 4.0, © GeoNames** (attribution is in the file header and on this page). 9 postcodes whose point was 5+ km away from the GeoNames gazetteer's town of 3,000+ people were moved to the gazetteer point (also GeoNames, CC BY 4.0): Celje 3000/3001 was 110 km off, Vrhnika 34 km, Velenje, Izola, Piran, Ankaran, Lendava 5–16 km.
- `src/lib/stats/slovenia.json`: the Slovenia outline from Natural Earth 1:10m admin-0 countries (**public domain**), every second point. Drawn as an inline SVG on `/stats/near`; no map tiles or external scripts.
- "Use my location" uses the browser's geolocation, rounded to 2 decimals (~1 km) before it goes into the URL; if it is blocked or fails the page says so and asks for a town or postcode.

## Still to do
- Once older seasons are in, re-tune Elo `K` (it was fitted on one season) and check the season carry-over.
- Upcoming fixtures: the crawler only stores played matches (status 1), so win chances show only for the few scheduled matches (status 0) that are in `stats.db`. Storing the schedule from `tekmeLige` would fill the "Upcoming" lists.
