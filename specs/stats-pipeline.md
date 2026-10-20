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
| Crawler | compose service `crawler`, same image as `app`, runs `scripts/crawler-loop.sh` | Every 6 h (`CRAWL_INTERVAL_SECONDS`): copies `scripts/chat-CLAUDE.md` to `/data/work/CLAUDE.md`, crawls the current season with `CRAWL_SHARDS` (3) parallel `scripts/crawl.py` processes, then each season in `CRAWL_HISTORY` ("72 71") once (marker file `/data/crawl-<id>.done`). |
| `stats.db` | `/data/stats.db` in the `app_data` volume, WAL mode, separate from `app.db` | seasons, competitions, matches (played only, `status = 1`), player_match, goalkeeper_match, events (play-by-play), team_zones, team_shooting, checks, crawl_runs (one row per crawler process: started_at, finished_at, season_id, matches_new, errors). Schema in `scripts/crawl.py`; `reviews` and `audits` in `scripts/review.py`. |
| Checks | `scripts/crawl.py` → `checks` table | Per match: player goals = score; play-by-play final = score; PDF score = score; goal zones + 7m = score (per team). A failed check is stored with its detail; the match is still loaded. `load` is stored only when a match fails to load, and deleted once it loads. |
| Review | `scripts/review.py`, run by `crawler-loop.sh` after each crawl | See "Review and audit" below. Writes only `reviews` and `audits`. |
| Data page | `/stats/data` (`src/lib/stats/quality.ts`) | Coverage per season and competition (matches, % with play-by-play, % with zones), check pass rates, failed checks with their review, the latest audit, the last crawl runs. |
| Stats pages | `/stats` (standings, results, top scorers, player search), `/stats/players/[id]` (profile vs position average, weak spots, match by match, similar players, drills button), `/stats/teams/[id]` (goal zones, squad, matches), `/stats/rankings` | Server components reading `stats.db` through `src/lib/stats/`. |
| Drills | `POST /api/stats/players/[id]/drills` | One `claude-pool` run with the player's numbers in the prompt; returns a Markdown training plan. |
| Chat tools | chat Claude, `CLAUDE_ALLOWED_TOOLS` in `infra/compose.yml` | `python3 /app/scripts/query.py "SELECT …"` (read-only SQL) and `python3 /app/scripts/players.py …`. Instructions: `scripts/chat-CLAUDE.md`. |

## Weak spots, similar players, rankings (same rules in `players.py` and `src/lib/stats/queries.ts`)
- Compared with players of the **same position in the same competitions**.
- Weak spot only with enough attempts: field shooting needs 15+ field shots and 8+ points below average; 7m needs 6+ attempts and 12+ points below; discipline needs 4+ matches and more than max(0.5, 2× average) suspensions per match.
- Similar players: z-scored fingerprint (goals/match, shots/match, field %, 7m share of shots, suspensions/match), Euclidean distance, +0.75 for a different position, same season, 15+ shots.
- Rankings: shooting % shrunk toward the average by 20 shots (15+ shots); 7m % by 5 attempts (5+ attempts).

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
| `REVIEW_MAX_RUNS` | 20 | AI reviews per run |
| `REVIEW_TIMEOUT_SECONDS` | 180 | per Claude run |
| `AUDIT_SAMPLE` | 10 | matches per audit |
| `AUDIT_EVERY_DAYS` | 7 | |

**Where it runs:** in the crawler container, right after each crawl, so reviews never lag behind the data. The `claude-pool` accounts are mounted read-only into `crawler`, the same way as into `app` (`infra/compose.yml`). Both containers share `/data/claude-pool-state.json`, so the review sees the same usage numbers as chat. The image installs `python3-fitz` (Debian bookworm, PyMuPDF 1.21); the script tries `import pymupdf` first and falls back to `import fitz`.

First run on 2026/27 (172 failed checks): rules explained 150 (43 goals without zone, 28 goals not credited, 22 teams without zones, 22 RZS 500s, 15 grids that hold the 7m, 11 goalkeeper goals, 6 partial zones, 1 registered result). 1 had no rule and no PDF, and 21 were left for the AI (mostly zones + 7m above the score).

## Still to do
- Per-player shot types (6m / wing / 9m) from the PDF player table (`scripts/parse_players.py`, in progress).
- Seasons before 2024/25 (`CRAWL_HISTORY`), team Elo, club locations ("near you").
