# Stats pipeline (part of the app)

The handball data collection is built into the app. Data source details: [data-source.md](data-source.md). Diagrams: [docs/diagrams](../docs/diagrams/README.md).

```
RZS API ──> crawler container ──> parsers ──> checks ──> /data/stats.db ──read-only──> stats pages + chat Claude
                                                 └──> checks table (one row per match per check)
```

## Principles
- **Code extracts, AI explains.** Every number in `stats.db` comes from code. Claude only reads it (pages, chat, drills) and never writes to it.
- **The crawler is not the chat agent.** It runs on a schedule in its own container; chat and pages only read the result.
- **Match data is cached** (gzipped API responses in `/data/cache`, keyed by URL), so the database can be rebuilt after a parser fix without asking RZS again. Season, league and round lists are always fetched fresh, so new matches show up.
- About 1 request per second per crawler process, 3 processes. Finished matches are never fetched twice.

## Pieces
| Piece | Where | What it does |
|---|---|---|
| Crawler | compose service `crawler`, same image as `app`, runs `scripts/crawler-loop.sh` | Every 6 h (`CRAWL_INTERVAL_SECONDS`): copies `scripts/chat-CLAUDE.md` to `/data/work/CLAUDE.md`, crawls the current season with `CRAWL_SHARDS` (3) parallel `scripts/crawl.py` processes, runs `scripts/clubs.py current`, then each season in `CRAWL_HISTORY` ("72 71") once (marker file `/data/crawl-<id>.done`). |
| `stats.db` | `/data/stats.db` in the `app_data` volume, WAL mode, separate from `app.db` | seasons, competitions, matches (played only, `status = 1`), player_match, goalkeeper_match, events (play-by-play), team_zones, team_shooting, checks. Schema in `scripts/crawl.py`. Plus clubs, team_clubs, postcodes from `scripts/clubs.py`. |
| Clubs | `scripts/clubs.py [season\|current]` → `clubs`, `team_clubs`, `postcodes` | Per competition `podatkiLiga/{league}/sezona/{season}/klubi` (cached, 1 request/s): club id, name, street, postcode, town. Contact names, phones and e-mails are not stored. `lat`/`lon` = the postcode centre from `scripts/data/si_postcodes.csv`. `team_clubs(team_id, season_id, competition_id, club_id)` from that list plus `home_club_id`/`away_club_id` of the matches. 2026/27: 66 clubs, all with coordinates. |
| Checks | `scripts/crawl.py` → `checks` table | Per match: player goals = score; play-by-play final = score; PDF score = score; goal zones + 7m = score (per team). A failed check is stored with its detail; the match is still loaded. |
| Stats pages | `/stats` (standings, results, top scorers, player search), `/stats/players/[id]` (profile vs position average, weak spots, match by match, similar players, drills button), `/stats/teams/[id]` (Elo rating, last-5 form, next matches with win chance, goal zones, squad, matches), `/stats/rankings`, `/stats/teams` (Elo table per competition: rating, change over the last 5, form, season sparkline, upcoming matches), `/stats/near` (clubs by distance from a town, postcode or the browser's location, on an SVG map of Slovenia) | Server components reading `stats.db` through `src/lib/stats/`. |
| Drills | `POST /api/stats/players/[id]/drills` | One `claude-pool` run with the player's numbers in the prompt; returns a Markdown training plan. |
| Chat tools | chat Claude, `CLAUDE_ALLOWED_TOOLS` in `infra/compose.yml` | `python3 /app/scripts/query.py "SELECT …"` (read-only SQL) , `python3 /app/scripts/players.py …` and `python3 /app/scripts/teams.py elo|predict|validate|near …`. Instructions: `scripts/chat-CLAUDE.md`. |

## Weak spots, similar players, rankings (same rules in `players.py` and `src/lib/stats/queries.ts`)
- Compared with players of the **same position in the same competitions**.
- Weak spot only with enough attempts: field shooting needs 15+ field shots and 8+ points below average; 7m needs 6+ attempts and 12+ points below; discipline needs 4+ matches and more than max(0.5, 2× average) suspensions per match.
- Similar players: z-scored fingerprint (goals/match, shots/match, field %, 7m share of shots, suspensions/match), Euclidean distance, +0.75 for a different position, same season, 15+ shots.
- Rankings: shooting % shrunk toward the average by 20 shots (15+ shots); 7m % by 5 attempts (5+ attempts).

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
- AI review of failed checks and a weekly sample read from the PDF image (see the design note in the chat of 2026-10-20).
- Per-player shot types (6m / wing / 9m) from the PDF player table (`scripts/parse_players.py`, in progress).
- Seasons before 2024/25 (`CRAWL_HISTORY`). Once they are in, re-tune Elo `K` (it was fitted on one season) and check the season carry-over.
- Upcoming fixtures: the crawler only stores played matches (status 1), so win chances show only for the few scheduled matches (status 0) that are in `stats.db`. Storing the schedule from `tekmeLige` would fill the "Upcoming" lists.
