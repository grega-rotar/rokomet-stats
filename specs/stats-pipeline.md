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
| Crawler | compose service `crawler`, same image as `app`, runs `scripts/crawler-loop.sh` | Every 6 h (`CRAWL_INTERVAL_SECONDS`): copies `scripts/chat-CLAUDE.md` to `/data/work/CLAUDE.md`, crawls the current season with `CRAWL_SHARDS` (3) parallel `scripts/crawl.py` processes, then each season in `CRAWL_HISTORY` ("72 71") once (marker file `/data/crawl-<id>.done`). |
| `stats.db` | `/data/stats.db` in the `app_data` volume, WAL mode, separate from `app.db` | seasons, competitions, matches (played only, `status = 1`), player_match, goalkeeper_match, events (play-by-play), team_zones, team_shooting, checks. Schema in `scripts/crawl.py`. |
| Checks | `scripts/crawl.py` → `checks` table | Per match: player goals = score; play-by-play final = score; PDF score = score; goal zones + 7m = score (per team). A failed check is stored with its detail; the match is still loaded. |
| Stats pages | `/stats` (standings, results, top scorers, player search), `/stats/players/[id]` (profile vs position average, weak spots, match by match, similar players, drills button), `/stats/teams/[id]` (goal zones, squad, matches), `/stats/rankings` | Server components reading `stats.db` through `src/lib/stats/`. |
| Drills | `POST /api/stats/players/[id]/drills` | One `claude-pool` run with the player's numbers in the prompt; returns a Markdown training plan. |
| Chat tools | chat Claude, `CLAUDE_ALLOWED_TOOLS` in `infra/compose.yml` | `python3 /app/scripts/query.py "SELECT …"` (read-only SQL) and `python3 /app/scripts/players.py …`. Instructions: `scripts/chat-CLAUDE.md`. |

## Weak spots, similar players, rankings (same rules in `players.py` and `src/lib/stats/queries.ts`)
- Compared with players of the **same position in the same competitions**.
- Weak spot only with enough attempts: field shooting needs 15+ field shots and 8+ points below average; 7m needs 6+ attempts and 12+ points below; discipline needs 4+ matches and more than max(0.5, 2× average) suspensions per match.
- Similar players: z-scored fingerprint (goals/match, shots/match, field %, 7m share of shots, suspensions/match), Euclidean distance, +0.75 for a different position, same season, 15+ shots.
- Rankings: shooting % shrunk toward the average by 20 shots (15+ shots); 7m % by 5 attempts (5+ attempts).

## Still to do
- AI review of failed checks and a weekly sample read from the PDF image (see the design note in the chat of 2026-10-20).
- Per-player shot types (6m / wing / 9m) from the PDF player table (`scripts/parse_players.py`, in progress).
- Seasons before 2024/25 (`CRAWL_HISTORY`), team Elo, club locations ("near you").
