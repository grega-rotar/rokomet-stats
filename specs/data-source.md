# Data source: RZS livestat (Slovenian handball federation)

Website: `https://livestat.rokometna-zveza.si/#/` (Vue SPA). It's a front end over a public JSON API:

**Base URL:** `https://infostat.rokometna-zveza.si/api/public` (set as `window.apiUrl` in the site's `index.html`)

- No auth, no token, no cookies. Every response is `{"message": "Enjoy the data.", "data": ..., "meta": null}`.
- `robots.txt` disallows nothing. No rate-limit headers, but it's one Apache/Laravel box: keep to ~1 request/second and cache finished matches.
- Errors come back as Laravel stack traces (404 = wrong route) or `{"message": "Težava pri pridobivanju podatkov...", "data": null}` (bad ids).
- Data belongs to RZS. Fine for our own stats; check their terms before republishing.

Checked by hand on 2026-10-20 (season 2026/2027).

## Endpoints

| What | Call | Returns |
|---|---|---|
| All seasons | `GET /seasons` | 28 seasons, `id` + `ime` (2026/2027 = 73 … 2004/2005 = 21). Ids are not sequential. |
| Leagues in a season | `GET /leaguesNew/{sezona}` | `data.seznamLig[]`: `id`, `ime` (≈120–240 per season, incl. youth, cups, play-off stages) |
| Competitions this season | `GET /prikaziLigeHeader` | current season only, grouped (men, women, youth, cups): `liga_id`, `sezona_id`, `naziv` |
| Round labels | `GET /pregledKrogiLiga/{sezona}/sezona/{liga}` | `data.krogi[]`: `krog` (label), `odigrano` (matches played) |
| Matches in a round | `POST /tekmeLige/{liga}/sezona/{sezona}` form `krog=<label>` | `data.tekme[]`: `id`, `status` (1 = played), `datumCler`, `cas`, `domaca_ekipa`, `gostujoca_ekipa`, `goli_domaci_konec`, `goli_gosti_konec`, `dvorana`, stream link |
| Latest played round | `GET /zadnjiOdigranKrogLiga/{sezona}/sezona/{liga}` | same shape as above |
| Match detail | `GET /pregledTekme/{matchId}` | half-time score, attendance (`gledalci`), round, `id_domaci`, `id_gosti` |
| Play-by-play | `GET /pregledAkcijTekma/{matchId}/tekma?nacinprikaza=1` | events: `minuta`, `naziv_akcije`, `ekipa` (1 home / 2 away), `sodelujoci` (player), running score |
| Player stats, one match | `GET /tekma/{matchId}/ekipa/{teamId}/igralci?vrstaEkipe=1` (2 = away) | goals, shots, 7m, cards, 2min, position, goalkeepers separately |
| **Stats PDF, one match** | `GET /natisniStatistikaTekme/{matchId}/tekme?&vrstTiskanja=1` | ~1 MB PDF, 4 pages. **Only source of goal zones and shot types.** |
| Standings after a round | `POST /pregledLigeKrogi/{liga}/sezona/{sezona}` form `krog` | `data.lestvica[]`: points, W/D/L, goals for/against, `idEkipe` |
| League totals | `POST /statistikaLigeSezonaKrogi/{liga}/sezona/{sezona}` form `krog` | home/away wins, goals per match, 7m %, suspensions; per-team 7m and suspension tables |
| Top scorers | `GET /strelciLige/{liga}/sezona/{sezona}&krogLige={krog}` (note `&`, not `?`; 99 = all rounds) | every scorer: goals, **attempts** (`st_strelov`), 7m, cards, 2min, `idIgralca` |
| Players in a league | `GET /preledIgralcevSezona/{sezona}/liga/{liga}/igralci` | all players with season totals (no attempts, no position) + team ids |
| Clubs in a league | `GET /podatkiLiga/{liga}/sezona/{sezona}/klubi` | teams, club address (`postna_st`, `mesto`), halls with address; no coordinates |
| Player profile | `GET /igralecPodatki/{player}/sezona/{sezona}/liga/{liga}` | name, birth date, licence, current club, loan club, season shirt number and position |
| Player's seasons / competitions | `GET /igralecSezone/{player}/sezone`, `GET /pregledIgralciSezonaLiga/{player}/sezone/{sezona}` | season ids; competitions played that season |
| Player, per match | `GET /npregledTekemIgralecLiga/{player}/sezona/{sezona}/liga/{liga}` | every match that season: goals, attempts, 7m, 2min, cards, `tekmaID`; plus totals |
| Player season totals | `GET /podatkiLigaIgralecStat/{player}/sezona/{sezona}/liga/{liga}` | goals, 7m, 2min, matches; `streli` is always "0", use the call above |
| Player career | `GET /pregledZgodovineIgralcaSelekcije/{player}`, then `POST /pregledZgodovineIgralca/{player}` form `ekipa=[selekcija ids]&sezone=[season ids]` (JSON arrays) | one row per season and age group: club, matches, goals, attempts, 7m, 2min |

Verified 2026-10-20; field meanings in [player-insights.md](player-insights.md) and [handball-glossary.md](handball-glossary.md). Player ids (`idIgralca`) are stable across seasons, age groups and competitions; team ids were the same in 2025/26 and 2026/27.

Not tried yet, found in the site's JS bundle: `statistikakipa/...` (team stats), `razporedEkipe/...` (team schedule), `podatkiekipa/...` (team details), `naslednjiKrog/...` (next round), `preledIgralcev` (POST, player search). Two routes are obfuscated (`sswuIKhEOv/...`, `kXQcq4weAvMKSTKZ/...`); leave them alone.

Known ids: season 2026/2027 = `73`; Liga NLB (1. SRL) = `1587`.

## Gotchas

- **League ids are mostly stable but not always.** Liga NLB is `1587` in 2024/25–2026/27, `1155` in 2011/12–2022/23, `1033` in 2008/09, `335` in 2004/05. Always list each season's leagues with `leaguesNew/{sezona}`; don't assume ids.
- **`krog` must be the exact label from `pregledKrogiLiga`.** The format differs by season: `"3"` in recent seasons, `"03. KROG"` in 2019/20 and older. Sending the wrong format returns an empty list, not an error.
- **Shot coordinates are empty in the JSON.** Play-by-play events have `koordinata_strela_start` / `koordinata_strela_end`, and the website has a shot-chart component for them, but the public API returns `null` for every match (checked all 48 Liga NLB matches, rounds 1–8). Use the PDF.

## Goal zones from the PDF

Parser: [`scripts/parse_zones.py`](../scripts/parse_zones.py) (needs `pypdf`). Outputs one JSON line per match: 9 zones (`top_left` … `bottom_right`, each `{goals, shots}`), misses (`over`/`left`/`right`), 7m, final score.

PDF layout:
- Page 1 / 3: home / away player table. The first `Skupaj` row is team totals: `goals shots % 7m 6m krilo 9m mimo ...` (each as `goals/shots`).
- Page 2 / 4: home / away diagrams. Left half "`<TEAM> V NAPADU`" = that team's shots: a 3×3 goal grid (`goals/shots on target` per zone), plain integers around it = shots that missed (over, left, right), and below it the court diagram with shooting positions and a `7m` label.
- Positions are **not fixed**: the away page is shifted ~27pt right, and a long team name wraps and pushes everything ~11pt down. The parser positions everything relative to the court's `7m` label (grid rows ~94/66/37pt above it, columns ~-40/-4/+38pt beside it).
- 7m penalties are **not** in the goal grid.
- Sanity check per team: zone goals + 7m goals = final score. Sometimes a goal is entered without a zone (round 8: Trebnje scored 33, only 32 have a zone). Store the difference as "goals without zone", don't treat it as an error.
- **Orientation: shooter's view** (settled from the rendered picture, 2026-10-20). The goal is drawn upright on top of the court plan, as seen from the court; "top right" = top right as the shooter faces the goal. Cross-check that confirmed it (match 220815): left wing Dolenc scored 5/5 from the wing, and the court's left corner shows 5/5; the right wings (2/2 + 0/1) give the right corner 2/3.
- For questions like this, look at the picture, not just the text layer: render the page with PyMuPDF (`page.get_pixmap(dpi=200)`) and view it.
- Misses (red numbers) sit in a 5×4 dashed grid around the goal: a top row over the goal plus a column wide left and wide right of each goal row. The parser only buckets them as over/left/right.
- Right half of each diagram page ("`<TEAM> V OBRAMBI`") = the opponent's shots against this team. It duplicates the other team's "V NAPADU", so skip it.

Verified on all 6 matches of Liga NLB round 8 (2026/2027).

## Player tables from the PDF

Parser: [`scripts/parse_players.py`](../scripts/parse_players.py) (needs `pypdf`). Reads the player table and goalkeeper table (pages 1/3) and the "Ostale akcije" table (pages 2/4) by x-position, since empty cells are missing from the text layer. The PDF is a separate record from the JSON: goals agree for 96% of player rows, shot counts and saves often differ. Take goals, attempts and saves from the JSON and only the shot-type split from the PDF. Check results and details: [player-insights.md](player-insights.md#2-pdf-player-table-parser-and-how-well-it-agrees).

### Coverage by season (Liga NLB, spot-checked one match per season, 2026-10-20)

| Seasons | Stats PDF | Goal zones |
|---|---|---|
| 2024/25 – 2026/27 | yes | yes (zones + 7m = score) |
| 2023/24 | not checked (first league id tried had no rounds) | ? |
| 2019/20 – 2022/23 | yes | almost none (a few goals per match; treat as no zones) |
| 2017/18 and older | no: endpoint returns a 1.5 KB HTML page instead of a PDF | no |

Check `Content-Type: application/pdf` before parsing.

### Coverage by competition (2026/27, one played match each, 2026-10-20)

Zones present: Liga NLB (1. SRL), 2. SRL moški, Super Pokal (men and women), Pokal Slovenije moški, 1. SRL ženske.
No zones: 1. B SRL moški (0% in the one match checked; check more), and **all youth competitions** (M20, M17, M15, M14, Ž19, Ž17, Ž15, Ž14), where zones + 7m explain only 2–22% of the score, i.e. effectively just the 7m.
So: results, player stats and play-by-play exist for every competition; goal zones only for the top senior leagues and cups. Coverage check script: one match per competition, compare (zone goals + 7m) / score.

## Bulk crawl plan

1. `seasons` → season ids.
2. `leaguesNew/{sezona}` → leagues in that season.
3. `pregledKrogiLiga/{sezona}/sezona/{liga}` → round labels; then `tekmeLige` with each label → match ids with `status == 1`.
4. For each new match: `pregledTekme`, play-by-play, player stats (JSON), plus the stats PDF where it exists (2019/20+) and its zones (2024/25+).
4. Cache by match id; never re-fetch a finished match. ~1 request/second.
