# Player insights: weak spots, drills, chat, rankings

Feasibility study for "pick a player, find weak spots, suggest drills" and "chat about results". All numbers were checked against real data on 2026-10-20: **Liga NLB 2026/27, rounds 1–8** (47 played matches, ids `220771`–`220818`; `220806` was not played), plus sample matches from 2. SRL and the M20 youth league. About 230 API requests in total, cached under `/tmp/claude-1000/-home-grega-grega-rotar-rokomet-stats/deepdive/`.

Handball terms are explained in [handball-glossary.md](handball-glossary.md). The API is described in [data-source.md](data-source.md).

**Short verdict.** Both features can be built. Weak spots work for **shooting** (overall, by distance, 7m), **discipline** (2-minute suspensions) and **goalkeeper save rates**, and only once a player has enough shots. Defence, assists, turnovers, playing time and per-player goal zones cannot be done from this data. Details are in [section 9](#9-verdict-and-how-it-fits-the-app).

---

## 1. What we can know per player

### Three sources, and which one to trust

| Source | Call | What it has | Trust |
|---|---|---|---|
| **Match player stats (JSON)** | `GET /tekma/{match}/ekipa/{team}/igralci?vrstaEkipe=1\|2` | Per player: goals, attempts, 7m goals/attempts, 2min, yellow, red, position, jersey number, `idIgralca`. Goalkeepers in a separate list: saves, shots faced, 7m saved/faced. | **Official record.** It equals the play-by-play exactly (checked on 220813 and 220815, every player). |
| **Play-by-play (JSON)** | `GET /pregledAkcijTekma/{match}/tekma?nacinprikaza=1` | Every shot, 7m, 2min, card and time-out, with the second it happened (`cas_tekme`) and the running score. | Same record as above, with timing added. |
| **Stats PDF** | `GET /natisniStatistikaTekme/{match}/tekme?&vrstTiskanja=1` | Per player: goals/shots **by type** (7m, 6m, wing, 9m), misses, attack type (set attack, counter-attack), cards, 2min. Goalkeepers: saves by type. "Other actions" table. Team goal zones. | **A second, separate record.** It mostly agrees on goals but often disagrees on shot counts and saves (see [section 2](#2-pdf-player-table-parser-and-how-well-it-agrees)). Use it only for the *type* breakdown. |

### Per match, per player (official JSON)

`zadetkov` (goals), `steviloStrelov` (attempts, including 7m and including saved and missed shots), `zadetki_7m` / `poskusi_7m`, `izkljucitve` (2-minute suspensions), `rumeni_karton`, `rdeci_kartoni`, `igralnoMesto` (position), `stevilkaIgralec` (shirt number), `idIgralca`.
Goalkeepers: `obrambe` (saves), `steviloMetov` (shots on target faced), `sedemObrambe` / `sedemVsi` (7m saved / faced).

A goalkeeper's "shots faced" only counts shots on target: in round 1–8 they faced 3,820 shots, which equals all goals plus all saves. Missed shots (372 field shots, 22 7m) are not counted against the keeper.

Goals scored by goalkeepers are not in the JSON player list: in 4 of 94 team-matches the field players' goals add up to 1–2 less than the score (220793, 220799, 220801, 220809).

### Play-by-play events

Rounds 1–8 contain exactly these event types (`naziv_akcije`, with `vrednost_akcije`):

| Event | Meaning | `vrednost_akcije` | `sodelujoci` holds | Count R1–8 |
|---|---|---|---|---|
| `Strel na gol` | field shot | 1 goal, 0 saved, -1 missed | the shooter | 2531 / 861 / 372 |
| `Strel na gol - Vratar` | the same shot, from the goalkeeper's side (only for goals and saves, not misses) | 1 goal conceded, 0 save | the goalkeeper | 2531 / 861 |
| `7M` | 7-metre penalty | 1 / 0 / -1 | the shooter | 341 / 87 / 22 |
| `7M -Vratar` | the same penalty, keeper's side | 1 / 0 | the goalkeeper | 341 / 87 |
| `2min-` | 2-minute suspension | 0 | the suspended player | 402 |
| `Rum. karton` / `Rdec. karton` | yellow / red card | 0 | the player | 78 / 15 |
| `Minuta` | team time-out | 0 | nobody | 225 |
| `Začetek tekme`, `Konec prvi polčas`, `Začetek drugi polčas`, `Konec tekme` | start, half time, second half, end | | | 47 each |

- `ekipa` = 1 home / 2 away, the team of the person in `sodelujoci` (so on a `- Vratar` row it is the keeper's team).
- `sodelujoci` is a **name string**, not an id. Join to the JSON player list by (match, team side, "first last").
- `minuta` is the minute; `cas_tekme` is the second (0–3600). `domaci_gol` / `gosti_gol` is the running score, but it sometimes updates one row late.
- `postavljena_obramba` is always null except on the start event. `koordinata_strela_*` are always null.
- `nacinprikaza` is only the sort order (asc/desc), not a different level of detail.
- **Not in play-by-play:** assists, turnovers, steals, blocks, fouls, shot type/distance, substitutions, playing time.

### PDF player table (pages 1 and 3)

Columns: `Goli` (goals), `Streli` (shots), `%`, then goals/shots by `7m`, `6m`, `Krilo` (wing), `9m`, then `Mimo` (missed), `Pos. obr.` (vs. set defence), `Pol PN` (secondary wave), `Hiter PN` (fast break), `Ni pod.` (no data), `RUM` (yellow), `RDE` (red), `2min`.
Goalkeeper table: `Obrambe` (saves), `Streli` (shots), `%`, saves/shots by 7m, 6m, wing, 9m, `Ni podat.`.
Parsed by [`scripts/parse_players.py`](../scripts/parse_players.py).

### "Ostale akcije" table (PDF pages 2 and 4)

Columns: `Prekršek +` (fouls drawn), `Podaja +` (assists), `Blok +` (blocks), `Žoga +` (steals), `7 +` (7m drawn), `2min +` (as listed; usually equals the player's own 2-minute count), `Žoga -` (turnovers), `Blok -` (shot blocked), `7m -` (7m caused), `Koraki -` (steps / travelling).

**These are recorded by the home club's scorer, and most clubs leave them empty.** Assists: non-zero in only 45 of 94 team-matches, almost all at Slovan, Slovenj Gradec, Celje, Ajdovščina, Velenje and Sviš home games, and mostly for the home team (Slovan at home: 24 assists vs. 5 for the visitors). Turnovers: recorded mainly at Ribnica home games (9–16 per team), almost never elsewhere. Steals: 6 in the whole season, blocks: 13. **This is not usable for comparing players.** At most: "assists recorded at some venues".

### Coverage by competition (2026/27)

| Competition | JSON stats + play-by-play | PDF shot types (6m/wing/9m) | PDF goal zones | Other actions |
|---|---|---|---|---|
| Liga NLB | yes | yes | yes (team only) | depends on home club |
| 2. SRL (checked match 220579, MRK NG – Kronos 35:22) | yes | yes (zones + types filled) | yes | fouls drawn only |
| M20 1. SRL (checked match 220935, Dobova – Velenje 34:33) | yes | **no**: only 7m filled; field goals and saves are 0 in the PDF | no | empty |

So for youth players we know goals, attempts (scored / saved / missed), 7m, 2min and cards, but not the shot distance.

### Player-level endpoints (from the site's JS bundle, all verified)

| Call | Returns |
|---|---|
| `GET /igralecSezone/{player}/sezone` | Seasons the player has data in. Jesenko: 2009/10 – 2026/27. |
| `GET /pregledIgralciSezonaLiga/{player}/sezone/{season}` | Competitions the player played in that season (e.g. Liga NLB + cup). |
| `GET /igralecPodatki/{player}/sezona/{season}/liga/{league}` | Profile: full name, licence number, date of birth, age, current club (with address), loan club (`posojenKlub`, with loan dates), citizenship, gender; season shirt number and position. |
| `GET /podatkiLigaIgralecStat/{player}/sezona/{season}/liga/{league}` | Season totals: goals, 7m, suspensions, matches. **`streli` is always "0"** (bug); use the next call. |
| `GET /npregledTekemIgralecLiga/{player}/sezona/{season}/liga/{league}` | **Per match** for that player: opponent, date, round, goals, attempts, %, 7m, 2min, warnings, red, `tekmaID`; plus season totals (`skupaj`). One call gives a player's whole season. |
| `GET /pregledZgodovineIgralcaSelekcije/{player}` | Age groups (`selekcija`, e.g. Mladinci, Člani) and seasons the player has history in. |
| `POST /pregledZgodovineIgralca/{player}` form `ekipa=[selekcija ids]`, `sezone=[season ids]` (JSON arrays) | Career table: one row per season and age group: club, matches, goals, attempts, 7m, suspensions. |
| `GET /preledIgralcevSezona/{season}/liga/{league}/igralci` | Every player in the league with season totals (goals, 7m, cards, 2min) and team ids. No position, no attempts. |
| `GET /strelciLige/{league}/sezona/{season}&krogLige={round}` | Top-scorer list, **with attempts** (`st_strelov`). Note the odd `&` instead of `?`; a high round (99) means "all". |
| `POST /strelciLigeKrogi/{league}/sezona/{season}` form `krog` | Same list without attempts and ids. |
| `POST /statistikaLigeSezonaKrogi/{league}/sezona/{season}` form `krog` | League totals (home/away wins, goals per match, 7m %, suspensions) plus per-team 7m and suspension tables. |
| `POST /pregledLigeKrogi/{league}/sezona/{season}` form `krog` | **Standings** after a round: points, W/D/L, goals for/against, team id. |
| `GET /podatkiLiga/{league}/sezona/{season}/klubi` | Teams in the league with club address and halls (address, size, seats). |

**Player id (`idIgralca`) is stable** across seasons, age groups and competitions: Matevž Jesenko is `22045` from Mlajši dečki B (under-12) in 2009/10 to Liga NLB in 2026/27. Erazem Cizerle (`30715`) has the same id in M20 1. SRL, 1. B SRL and the cup this season. **Team ids** (e.g. RD Škofja Loka `4293`) were the same in 2025/26 and 2026/27; club ids (Škofja Loka `743`) are separate and also stable.

### Example inventories

| Player | League, position | What we have |
|---|---|---|
| **Matevž Jesenko** (`22045`), RD Škofja Loka | Liga NLB, centre back | 8 matches, 20 goals / 28 attempts, 7m 3/4, 1×2min; PDF types: 6m 12/16, 9m 6/8; timing of every shot; career back to 2009/10 (2024/25: 103 goals in 31 matches, 7m 39/46). |
| **Žan Ozmec** (`19812`), RK Gorišnica | 2. SRL, left wing | 5 matches (220553, 220556, 220564, 220569, 220575): 57 goals / 83 attempts, 7m 23/23 (!), 2×2min, 1 red. Shot types available from the PDF. |
| **Erazem Cizerle** (`30715`), RK Trimo Trebnje (on loan to RK Grosuplje until 2027-06-30) | M20 1. SRL, right wing, born 2008 | 6 matches (220907, 220910, 220920, 220921, 220932, 220934): 51 goals / 66 attempts, 7m 18/21, 0×2min. **No shot types** (youth PDF). Also plays 1. B SRL and the cup. |

---

## 2. PDF player-table parser and how well it agrees

[`scripts/parse_players.py`](../scripts/parse_players.py) reads the player table, goalkeeper table and "Ostale akcije" table by x-position (each number goes to the nearest header label on the same page), and joins long names that wrap onto a second line.

Checked against the JSON (`tekma/{match}/ekipa/{team}/igralci`):

| Check | Round 8 (220813–220818) | Rounds 1–8 (47 matches) |
|---|---|---|
| PDF team goals = final score | **12 / 12** | 93 / 94 (220797: PDF gives Slovenj Gradec 29, official score 28) |
| PDF player goals = JSON goals | **184 / 188** player rows (all 4 misses in 220813, Slovan) | 1419 / 1483 (96%) |
| 7m goals and attempts, 2min, yellow, red, position | 188 / 188 | 1483 / 1483 |
| Attempts (PDF shots + misses = JSON attempts) | 130 / 188 | 1049 / 1483 (71%) |
| Goalkeeper saves and shots identical | 9 / 27 | 82 / 223 (37%) |

What this means:
- The **parser is right**: every number lands in the right column (checked against the rendered page for 220815 and on the youth and 2. SRL layouts).
- The **PDF itself is a different record**. Goal mismatches are almost always swaps between two teammates (one +1, the other -1), in 23 of 47 matches. Shot counts and saves differ more. In 220813 Ormož's keepers have **0 saves** in the PDF but 8 + 0 in the JSON, and Slovan's PDF has no misses or saves at all.
- **Rule for the app:** goals, attempts, 7m, 2min, cards and saves come from the JSON. The PDF only adds the **share and success rate by shot type** (6m / wing / 9m) and the attack type. Skip a match's PDF goalkeeper-by-type numbers when its PDF save total is 0 but the JSON has saves.

---

## 3. Weak spots: what can honestly be derived

### League baselines (Liga NLB 2026/27, rounds 1–8)

"Field shots" means all attempts except 7m penalties. Field % = goals / attempts (official JSON, saved and missed shots both count as failures). The by-type columns come from the PDF and count goals / shots of that type.

| Position (API name) | Players listed | Field % | 7m | 2min per match | 6m % | Wing % | 9m % |
|---|---|---|---|---|---|---|---|
| Left back (`Levi zunanji`) | 35 | 62.9% | 26/34 | 0.31 | 77% | (9 shots) | 57% |
| Centre back (`Srednji zunanji`) | 36 | 67.1% | 152/189 | 0.14 | 79% | – | 58% |
| Right back (`Desni zunanji`) | 22 | 61.1% | 54/71 | 0.27 | 73% | (14 shots) | 58% |
| Left wing (`Levo krilo`) | 35 | 70.3% | 26/39 | 0.37 | 81% | 71% | 76% (45 shots) |
| Right wing (`Desno krilo`) | 25 | 68.9% | 60/86 | 0.16 | 79% | 68% | (23 shots) |
| Pivot (`Krožni napadalec`) | 36 | 77.4% | 23/31 | 0.57 | 78% | – | – |
| **All field players** | 189 | 67.3% | **341/450 = 75.8%** | 0.31 | | | |

Goalkeepers (`Vratar`): league save rate 948 / 3,820 = **24.8%** of shots on target (field shots only: 25.4%). By distance (PDF): 7m 17%, 6m 18%, wing 27%, 9m 32%.
By match phase (all attempts): first half 68.0%, minutes 31–50 67.2%, last 10 minutes 70.5%.

"Per match" means per match on the team sheet. **There is no playing time in the data**, so a substitute who played 5 minutes counts as a full match.

### Sample size: when a claim means anything

A shooting percentage from a few shots is mostly noise. For a rate around 60%:

| Shots | Plus/minus (90% range) | What you can claim |
|---|---|---|
| 10 | ±25 points | nothing |
| 20 | ±18 points | only extreme gaps |
| 30 | ±15 points | "clearly below/above" if the gap is 15+ points |
| 50 | ±11 points | normal claims |

Rules for the app:
1. Show a weak spot only when the player's 90% range is **entirely below** the position average (Wilson interval; the code computes it, the AI does not).
2. Minimum: **30 field shots** for overall %, **20 shots of a type** for 6m/wing/9m, **15 penalties** for 7m, **6 matches** for suspensions per match. Below that, say "not enough data yet".
3. After 8 rounds only 53 of 189 field players have 30+ field shots, 18 have 20+ 9m shots, and only 3 have 20+ penalties. **Most weak-spot claims become possible around mid-season**, or when last season is included.
4. Always compare within the same position. Pivots score 77%, backs 61–67%, so a back at 65% is fine and a pivot at 65% is not.

### Example profiles (season to date)

**Mihail Ivanoski** (`37968`), RK Gorenje Velenje, right back. Matches 220772, 220781, 220785, 220792, 220798, 220803, 220811, 220814.

| Measure | Value | Position average | Verdict |
|---|---|---|---|
| Goals per match | 41 in 8 = 5.1 | | high volume (9 attempts per match) |
| Field shots | 34/63 = 54% (90% range 44–64%) | 61% | below, but the range includes the average: **not a firm claim** |
| 9m shots (PDF) | 11/32 = **34%** (range 22–49%) | 58% | **supported weak spot** |
| 6m shots (PDF) | 21/28 = 75% | 73% | fine |
| 7m | 7/9 = 78% | 76% | too few penalties |
| 2min | 4 in 8 = 0.50 | 0.27 | higher, but 4+ happens by chance 17% of the time: **not a firm claim** |
| Field shots saved / missed | 20 saved, 9 missed | | |
| Form (goals/attempts by round) | R1 1/5, R2 7/10, R3 10/16, R4 4/7, R5 3/7, R6 7/13, R7 3/4, R8 6/10 | | |

→ Weak spot: **long-range (9m) shooting**.

**Nal Roš Omahen** (`27314`), RK Sviš Ivančna Gorica, left back. Matches 220776, 220777, 220788, 220790, 220799, 220803, 220810, 220816.

| Measure | Value | Position average | Verdict |
|---|---|---|---|
| Field shots | 10/30 = **33%** (range 21–48%) | 63% | **supported weak spot** |
| of which saved / missed | 19 saved, 1 missed | | he hits the target but the keeper saves: shot placement / choice, not accuracy |
| 9m (PDF) | 5/13 = 38% | 57% | too few shots alone, consistent with the above |
| 6m (PDF) | 4/10 = 40% | 77% | too few shots |
| 7m | 7/8 = 88% | 76% | too few penalties |
| Last 10 minutes | 2/7 | 70.5% | too few |
| Form | R1 1/6, R2 2/6, R3 2/5, R4 2/5, R5 1/3, R6 3/5, R7 3/5, R8 3/3 | | improving lately, small numbers |

→ Weak spot: **finishing (shots are saved)**.

**Žiga Stopar** (`18800`), RD Škofja Loka, pivot. Matches 220771, 220782, 220784, 220793, 220797, 220804, 220810, 220815.

| Measure | Value | Position average | Verdict |
|---|---|---|---|
| 2min suspensions | **10 in 8 matches = 1.25** | 0.57 | **supported weak spot** (10+ by chance: 2%) |
| Cards | 1 yellow, 2 red | | 2 reds in 8 matches is a lot (a player's third 2min in one match also means a red card) |
| 7m caused ("Ostale akcije", PDF) | 14 | | recorded at only some venues: mention, don't rank |
| Field shots | 27/36 = 75% (range 62–85%) | 77% | normal |
| Fouls drawn (PDF) | 35 | | good for a pivot, venue-dependent |

→ Weak spot: **defensive discipline (suspensions)**.

**Matevž Jesenko** (`22045`), RD Škofja Loka, centre back. Same matches as Stopar.

| Measure | Value | Position average | Verdict |
|---|---|---|---|
| Field shots | 17/24 = 71% (range 54–83%) | 67% | not enough shots |
| 9m (PDF) | 6/8 = 75% | 58% | not enough shots |
| 7m | 3/4 | 76% | not enough |
| 2min | 1 in 8 | 0.14 | normal |
| Last 10 minutes | 5/9 = 56% | 70.5% | not enough |
| Form | R1 1/1, R2 0/0, R3 1/2, R4 2/3, R5 1/1, R6 0/0, R7 7/10, R8 8/11 | | barely shot in rounds 1–6, then 15 goals in rounds 7–8 |

→ **No supported weak spot.** The honest answer: "Too few shots for a reliable picture. Last season (2025/26: 87 goals in 32 matches, 7m 33/49 = 67%) suggests looking at penalties, but that is last season's number." Career data (`pregledZgodovineIgralca`) makes this kind of fallback possible.

**Balša Ćirović** (`37257`, goalkeeper), RK Ajdovščina. Matches 220773, 220781, 220784, 220794, 220795, 220808, 220817.

| Measure | Value | League average | Verdict |
|---|---|---|---|
| Save rate | 26/154 = **17%** (range 12–22%) | 24.8% | **supported weak spot** |
| 6m (PDF) | 9/69 = 13% (range 8–21%) | 18% | below, range overlaps |
| Wing (PDF) | 3/27 = 11% (range 5–25%) | 27% | **supported** (just) |
| 9m (PDF) | 8/29 = 28% | 32% | normal |
| 7m | 2/18 | 17% | normal |

→ Weak spot: **wing shots** and overall save rate. Context the AI must give: Ajdovščina has 1 point from 7 matches, so the defence in front of him lets through many close shots. Save % depends on the defence too.

Other two leagues, briefly: **Žan Ozmec** (2. SRL) 7m 23/23 is perfect but 23 penalties is still a small sample; **Erazem Cizerle** (M20) 51 goals / 66 attempts = 77% with no shot types available, so only overall % and 7m (18/21) can be judged.

### What is not possible

| Claim | Why not |
|---|---|
| Per-player goal zones ("shoots low left too often") | Zones exist only per team in the PDF. Play-by-play coordinates are always null. |
| Defence (1-on-1, blocks, steals) | Not recorded, or recorded only at a few venues ("Ostale akcije"). |
| Assists, turnovers, technical faults | Same: venue-dependent, empty for most matches. |
| Playing time, per-60-minute rates | No minutes or substitutions in the data. |
| Shot type for youth players | Youth PDFs have only 7m. |
| Which shot type was missed | Misses (`Mimo`) have no type in the PDF; type % counts goals out of typed shots. |
| Clutch play | Last 10 minutes with the score within 3: the whole league has 234 such attempts in 8 rounds; per player it is 0–6 shots. |

---

## 4. Drills

The data only chooses **which weakness** to work on. The drill itself is written by the AI from general coaching knowledge. Example drills per weakness type the data supports:

**Low 9m (long-range) shooting** (e.g. Ivanoski)
1. *Jump-shot series from 9–10 m*: 3 lines (left, centre, right back), pass, 3-step run-up, jump shot over a static blocker or a tall mannequin; 10 shots per position, aim at the far corners; count goals.
2. *Shot after a feint*: run at a passive defender, feint one way, shoot from 8–9 m on the other side; teaches making space instead of shooting into a block.
3. *Decision drill*: 2 backs vs 1 defender; shoot only when the defender doesn't step out, otherwise pass. Cuts low-percentage shots.

**Low finishing, shots saved** (e.g. Roš Omahen)
1. *Corner targets*: hang targets in the 4 corners; shoot from 6 m and 9 m, points only for a target hit. Builds placement over power.
2. *Look at the keeper*: shoot against a live keeper, and before each shot the coach calls a corner the keeper has left open (or the shooter calls it). Trains reading the goalkeeper.
3. *Shot variety*: series of bounce shots, hip-height shots and lobs from 6 m; goalkeepers adapt to one pattern.

**Poor 7m conversion** (only with 15+ penalties)
1. *Pressure series*: 5 penalties in a row against the team's best keeper; miss = the group runs a short sprint. Simulates match pressure.
2. *Routine*: same set-up every time (ball bounce, breath, look), then 2 fixed target corners and 1 lob. Count conversion over weeks.
3. *Keeper reading*: watch the keeper's first movement, shoot to the other side; with video if possible.

**Many 2-minute suspensions** (e.g. Stopar)
1. *Legal defence footwork*: 1-on-1 in a 3 m wide channel; the defender may only use the body and arms in front, never pull or push from the side. Coach whistles every illegal contact.
2. *Arm discipline drill*: defend against a pivot with both hands visible (on the attacker's chest/hip in front), practising the release when the attacker turns.
3. *Video review*: go through the 10 suspensions (minutes are in the play-by-play) and say which were avoidable: late arrivals, pulling the shirt, hitting the arm on a shot.

**Low goalkeeper save rate from the wing / by distance** (e.g. Ćirović)
1. *Wing angle series*: wingers shoot from both corners in turn; the keeper practises the short-post position and the step towards the shooter.
2. *Reaction work*: shots from 6 m at short notice (coach points the shooter), 3 × 10 shots.
3. *Distance mix*: alternate 9 m and 6 m shots so the keeper practises setting position for each distance.

**Risks and rules for the AI**
- **Small samples.** Only show a weak spot when the code has marked it as supported (section 3). Otherwise say "not enough data".
- **Position context.** Compare only within the same position. Wings and pivots naturally shoot from close range.
- **Team context.** A keeper behind a weak defence, or a back who takes the hard shots when the clock runs down, will look worse.
- **Cite the numbers.** Every claim must quote the number, the sample size and the matches (e.g. "9m: 11 of 32, league right backs 58%, rounds 1–8"). The fact sheet is the only source; the AI must not invent stats or add numbers that are not in it.
- **Not a coach.** The drills are general suggestions. Say so, and leave the decision to the player's coach.

---

## 5. Chat about results: what it can and can't answer

**Can answer** (all from verified endpoints):
- Results and fixtures: "What did Celje play in round 6?", "When does Škofja Loka play next?" (`tekmeLige`, `naslednjiKrog`, `razporedEkipe`).
- Standings after any round: "Who led after round 5?" (`pregledLigeKrogi`).
- Head-to-head between two teams, from all stored matches (back to 2004/05 for results).
- Top scorers, with attempts and 7m: "Who has the best 7m record with 15+ penalties?" (`strelciLige`).
- A player's season and career: "How many goals did Jesenko score per season?" (`pregledZgodovineIgralca`).
- Team shooting: shot mix by distance, set attack vs fast break, and **team goal zones** (2024/25+, top leagues): "Where does Slovan score most?".
- Goalkeeper form: save % per match, by distance (with the PDF caveat).
- Match flow: "When did Trebnje take the lead?", "Biggest comeback this season?", "Goals in the last 10 minutes" (play-by-play).
- Discipline: suspensions per team and player, red cards.
- League facts: home win rate (20 home / 22 away / 5 draws after round 8), goals per match (61.3), 7m conversion (75.8%).
- Team ratings (Elo) and form (section 8).

**Can't answer:**
- Assists, turnovers, steals, blocks, defensive actions (not recorded or only at some venues).
- Minutes played, line-ups on court, who was on the bench.
- Per-player shot zones ("Where does Anžič shoot?").
- Shot coordinates / heat maps.
- Shot types and zones for youth leagues, and zones before 2024/25.
- Anything about injuries, transfers beyond the loan field, or salaries.

---

## 6. Similar players

### Fingerprint

For every field player with **20+ attempts** (89 players in Liga NLB after round 8):

| Feature | Source |
|---|---|
| Share of attempts that are 7m | JSON |
| Share of typed shots from 6m / wing / 9m | PDF |
| Field-shot %, shrunk towards the league average with 20 shots of weight | JSON |
| 9m %, shrunk towards the position average with 15 shots of weight | PDF |
| 7m %, shrunk towards 76% with 10 penalties of weight | JSON |
| Attempts per match | JSON |
| 2min per match | JSON |

"Shrunk" means: (goals + w × average) / (shots + w). A player with few shots stays close to the average instead of looking extreme.

Method: z-score each feature across the 89 players, weight the shot-mix features 1.5, the 9m % 0.7, 7m % and 2min 0.5, the rest 1, and take the Euclidean distance. Position is not a feature: the shot mix finds the role on its own (e.g. a back who plays near the 6 m line).

Goalkeepers (20 keepers with 80+ shots faced): save %, shrunk with weight 40, plus save % by 7m / 6m / wing / 9m, shrunk with weight 15; plain Euclidean distance.

### Examples (rounds 1–8)

**Matevž Jesenko** (centre back; 7m share 14%, 6m 67%, 9m 33%, 3.5 attempts per match):

| Distance | Player | Team | Position |
|---|---|---|---|
| 1.18 | Marko Kotar | RK Trimo Trebnje | centre back |
| 1.37 | Rok Gregorič | ŠRD Škofljica | centre back |
| 1.45 | Miha Štaleker | RK Slovenj Gradec | left back |
| 1.54 | Jure Švalj | RK Ajdovščina | right back |
| 1.58 | Mirko Latković | RD LL Grosist Slovan | right back |

**Mihail Ivanoski** (right back; 52% of shots from 9m, 9 attempts per match, 9m % 42% after shrinking):

| Distance | Player | Team | Position |
|---|---|---|---|
| 1.71 | Tio Malović | RK Ajdovščina | left back |
| 1.78 | Andrej Yankovskyy | RK Gorenje Velenje | centre back |
| 1.95 | Timotej Grmšek | RK Trimo Trebnje | right back |
| 2.04 | Jakob Ščuka | MRK Krka | left back |
| 2.19 | Jaka Đekić | RD Riko Ribnica | left back |

Goalkeeper **Mark Šalamon** (Trebnje, 31% save rate): closest are Gal Gaberšek (Celje), Aljoša Čudić (Slovenj Gradec), Tilen Grudnik (Škofja Loka).

Use in the app: "players like X" for comparison, and "what do similar players with a better 9m % do differently" (more 6m shots, fewer attempts). Rebuild the fingerprints after every round. With more seasons, use only the last 12 months.

---

## 7. "Near you"

- **Clubs have an address but no coordinates.** `podatkiLiga/{league}/sezona/{season}/klubi` gives each club's `ulica`, `hisna_st`, `postna_st` (postcode), `mesto` (town), and its halls (`dvorane[]`: name, `naslov`, `posta`, `kraj`, plus size and seats). No lat/long anywhere in the response. `igralecPodatki` and `npregledTekemIgralecLiga` repeat the club address.
- To get distances, geocode **once** per club with a static table of Slovenian postcodes and their coordinates. Postcode precision (a few km) is enough for "clubs near you". All 12 Liga NLB clubs have a postcode.
- The match hall is in `pregledTekme` (`nazivDvorane`) and `tekmeLige` (`dvorana`).
- **Players to clubs per season:** yes. Each match's player list belongs to a team id, team ids are stable across seasons (Škofja Loka `4293` in 2025/26 and 2026/27), and `pregledZgodovineIgralca` gives the club per season and age group. `igralecPodatki` adds the current club and any loan club with dates (Cizerle: Trebnje, on loan to Grosuplje 2026-09-02 to 2027-06-30).
- So "players near you" = players whose club this season is within X km. "Matches near you this weekend" = upcoming matches in halls within X km.

---

## 8. Rankings

### Per-position player rankings

- Rank within position groups (backs, wings, pivots, keepers), never across them.
- Use a **shrunk percentage**: (goals + 30 × position average) / (shots + 30). A player with 10/10 does not top the list.
- Show a player only with **30+ field shots** (keepers: 100+ shots faced). Mark players with 30–50 shots as "provisional".
- Show "goals above average" next to it: goals − shots × position average. It rewards players who score well **and** shoot a lot.

Real example: backs, rounds 1–8, 30+ field shots (35 players). Top 5 and bottom 5:

| # | Player | Team | Pos. | Field goals/shots | Raw | Shrunk | Pos. avg | Goals above avg |
|---|---|---|---|---|---|---|---|---|
| 1 | Aljuš Anžič | RK Celje Pivovarna Laško | CB | 46/55 | 84% | 78% | 67% | +9.1 |
| 2 | Martin Drnovšek | RD Škofja Loka | LB | 35/45 | 78% | 72% | 63% | +6.7 |
| 3 | Kiryl Samoila | RD LL Grosist Slovan | LB | 28/36 | 78% | 71% | 63% | +5.4 |
| 4 | Matevž Žagar | MRK Krka | LB | 26/34 | 76% | 70% | 63% | +4.6 |
| 5 | Uroš Milićević | RK Celje Pivovarna Laško | LB | 47/64 | 73% | 70% | 63% | +6.7 |
| … | | | | | | | | |
| 31 | Domen Košir | RK Sviš | RB | 17/35 | 49% | 54% | 61% | -4.4 |
| 32 | Janez Guček | ŠRD Škofljica | LB | 21/42 | 50% | 55% | 63% | -5.4 |
| 33 | Jaka Đekić | RD Riko Ribnica | LB | 21/42 | 50% | 55% | 63% | -5.4 |
| 34 | Žan Pajk | RK Sviš | LB | 16/35 | 46% | 54% | 63% | -6.0 |
| 35 | Nal Roš Omahen | RK Sviš | LB | 10/30 | 33% | 48% | 63% | -8.9 |

### Team Elo

(Study numbers. The app now runs Elo with settings fitted on the data: see [stats-pipeline.md](stats-pipeline.md), "Team Elo".)

Start at 1500, K = 32, home advantage +50, margin multiplier ln(goal difference + 1), draws count as half a win. Rounds 1–8:

| # | Team | Elo | Points (season) | Goal diff per match | Last 5: points, GD per match |
|---|---|---|---|---|---|
| 1 | RD LL Grosist Slovan | 1672 | 14/16 | +7.8 | 8/10, +6.8 |
| 2 | RK Trimo Trebnje | 1644 | 13/16 | +5.1 | 8/10, +5.4 |
| 3 | RK Celje Pivovarna Laško | 1629 | 12/16 | +5.9 | 8/10, +6.8 |
| 4 | RK Slovenj Gradec | 1567 | 10/16 | +2.6 | 7/10, +3.2 |
| 5 | MRK Krka | 1545 | 12/16 | +0.5 | 7/10, -1.2 |
| 6 | RD Škofja Loka | 1518 | 11/16 | +0.8 | 7/10, -0.8 |
| 7 | RK Gorenje Velenje | 1477 | 8/16 | -0.1 | 4/10, -1.0 |
| 8 | RK Jeruzalem Ormož | 1433 | 6/16 | -2.4 | 3/10, -3.0 |
| 9 | RD Riko Ribnica | 1419 | 3/14 | -3.9 | 3/10, -1.0 |
| 10 | ŠRD Škofljica | 1396 | 4/16 | -6.1 | 2/10, -7.4 |
| 11 | RK Ajdovščina | 1358 | 1/14 | -5.7 | 1/10, -5.0 |
| 12 | RK Sviš Ivančna Gorica | 1342 | 0/16 | -5.6 | 0/10, -4.6 |

Elo ranks Krka (12 points but only +0.5 goals per match) below Slovenj Gradec (10 points, +2.6), which is the point of using it. Run it over all seasons from 2004/05 (results exist for every season), carry ratings across seasons pulled ⅓ back towards 1500, and tune K on past seasons.

### Form

- Team: points and goal difference over the last 5 matches against the season (table above).
- Player: shrunk field % and goals per match over the last 5 matches against the season. Only call it a "hot/cold streak" if the last-5 range does not overlap the season average (rarely true with 5 matches). Jesenko's rounds 7–8 (15 of 21) against rounds 1–6 (5 of 7) is a role change (more shots), not a change in quality.

### Comparing across leagues

Shooting rates look the same in every league. From each league's top-scorer list (`strelciLige`, all players): field shots 66.0% in Liga NLB, 64.8% in 2. SRL, 64.7% in M20 1. SRL; 7m 76% / 76% / 75%. (The top-scorer list counts a few more attempts than the match JSON, hence 66.0% here vs. 67.3% in section 3.) That is because opponents get weaker in the same step, so **a percentage from 2. SRL is not worth the same as one from Liga NLB.** Rank players only within one competition. A conversion factor can be estimated later from players who play in two competitions in the same season (e.g. Cizerle: M20 and 1. B SRL with the same player id), but there are not enough of them for that yet.

---

## 9. Verdict and how it fits the app

| | Status |
|---|---|
| Results, standings, top scorers, player season and career pages, match flow | **Doable now** straight from the API; better from `stats.db`. |
| Weak spots: overall %, 9m / 6m / wing %, 7m %, suspensions, goalkeeper save % (overall and by distance) | **Needs the crawler + `stats.db` first**, because baselines need the whole league; then doable. Claims mostly from mid-season on, or by adding last season. |
| Similar players, position rankings, Elo, form | Needs `stats.db`; the maths is simple (this study did it in ~150 lines of Python). |
| "Near you" | Needs a one-time postcode-to-coordinates table. |
| Per-player zones, defence, assists, turnovers, playing time, youth shot types | **Not possible** with this data. |

### AI setup

- **Chat about results:** one Claude agent with **read-only SQL** on `stats.db` (as planned in [stats-pipeline.md](stats-pipeline.md)), plus a few prepared views: `player_season` (per player, season, competition), `position_baselines`, `team_elo`, `standings`. Its working folder holds: the schema, [handball-glossary.md](handball-glossary.md), the coverage table (which competition has which data, from section 1 and data-source.md), and the sample-size rules from section 3.
- **Player report:** a **separate, fixed step**, not free SQL. Code builds a fact sheet (JSON) for the player: the numbers from section 3, the baselines, the 90% ranges, and a flag on each weakness that passes the rules. Claude gets only that fact sheet plus the glossary and writes the report and drills, quoting the numbers from the sheet. This keeps the statistics in code (same principle as "code extracts, AI checks") and keeps reports consistent between players. The chat agent can call the same step when a user asks about a player's weaknesses.
- Cache each report per player and round; rebuild after each new round.
