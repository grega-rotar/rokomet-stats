# rokomet-stats

Specs live in [`specs/`](specs/README.md). Read the relevant one before working on that area.

- Handball data (RZS livestat API, stats PDFs, goal zones, bulk crawl): [`specs/data-source.md`](specs/data-source.md)
- Stats pipeline in the app (crawler, stats.db, checks): [`specs/stats-pipeline.md`](specs/stats-pipeline.md)
- Goal-zone PDF parser: [`scripts/parse_zones.py`](scripts/parse_zones.py)
- Data survey (counts + spot checks): [`scripts/survey.py`](scripts/survey.py)
- Stats UI: `src/app/stats/`, queries in `src/lib/stats/`; diagrams in [`docs/diagrams/`](docs/diagrams/README.md)
- Chat Claude's instructions on the server: [`scripts/chat-CLAUDE.md`](scripts/chat-CLAUDE.md) (copied to `/data/work/CLAUDE.md` by the crawler)

## Answering handball questions (results, players, drills)

The data is in `data/stats.db` locally (SQLite, filled by `python3 scripts/crawl.py [season_id|current] [shard/shards]`; 73 = 2026/2027). Query it with `python3 scripts/query.py "SELECT …"` (read-only). Never write to it.

Tables: `seasons`, `competitions` (id, season_id, name, category top/senior/youth), `matches` (scores, half-time, hall, attendance, referees, coaches), `player_match` (one row per player per match: goals, shots, 7m, yellow, red, two_min, position; `raw` has the API row), `goalkeeper_match` (`raw` JSON: obrambe = saves, steviloMetov = shots faced, sedemVsi/sedemObrambe = 7m faced/saved), `events` (play-by-play: minute, side, type, value 1 goal / 0 saved / -1 missed, player), `team_zones` (goal zones per team per match, shooter's view), `team_shooting` (7m, misses around goal), `player_shot_types` (per player per match from the PDF: goals/shots by 7m, 6m, wing, 9m, plus misses; top senior competitions only; join `player_match` on match_id + side + player_id), `checks` (per-match cross-checks).

Player tools: `python3 scripts/players.py find NAME | profile ID | similar ID | rank METRIC [POSITION] [COMPETITION]` (METRIC also 9m, 6m, wing).

Rules:
- Every number you state comes from a query or a tool output. Show the numbers you used (e.g. "8/10 from 9m"). Never invent stats.
- Say when a sample is small (under ~15 shots or ~4 matches) and don't call it a weakness.
- Goal zones exist per team only (not per player), only for top senior competitions, and only from 2024/25. Shot types per player (7m / 6m / wing / 9m) are in `player_shot_types`, only for the top senior competitions; goals and shots totals still come from `player_match` (the PDF is a separate record), the PDF gives only the split by type. A shot-type weak spot needs 15+ attempts of that type and 10+ points below the position average.
- Drills: pick the weakness from the data, then write the drill from general handball coaching knowledge. Say which numbers the drill targets.
- Handball terms and Slovenian labels: `specs/handball-glossary.md` (if present) and `specs/data-source.md`.
