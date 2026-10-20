# Handball glossary and primer

For people (and the chat AI) who are not handball experts. Slovenian terms are the ones that appear in the RZS API field names, PDF labels and play-by-play. Data details: [data-source.md](data-source.md), [player-insights.md](player-insights.md).

## Handball in two minutes

- **Teams:** 7 on court per team: 1 goalkeeper + 6 court players. Up to 16 on the team sheet; unlimited substitutions on the fly.
- **Time:** 2 × 30 minutes (youth: shorter in the youngest groups). Each team may take a few 1-minute **time-outs** (`Minuta`).
- **Court:** 40 × 20 m. The **6 m line** (goal area) may only be entered by the goalkeeper; attackers shoot by jumping in from outside it. The dashed **9 m line** marks the free-throw line; shots from around or beyond it are "long-range" shots.
- **Scoring:** a goal is 1 point. Matches typically end around 30:28; Liga NLB averages **61 goals per match** (both teams together).
- **Points in the table:** win 2, draw 1, loss 0.
- **7 m penalty** (`7m`, `sedemmetrovka`): free shot from 7 m against the goalkeeper only, given when a clear chance is stopped by a foul.
- **2-minute suspension** (`2min`, `izključitev`): the player must leave the court for 2 minutes and the team plays with one fewer. **The third 2min for the same player in a match means a red card** (disqualification).
- **Cards:** yellow (`rumeni karton`, `opomin`) = warning; red (`rdeči karton`, `diskvalifikacija`) = disqualification for the rest of the match.
- **Attack types:** set attack against an organised defence (`postavljena obramba`), **fast break** (`hiter protinapad`) straight after winning the ball, and the **secondary wave** (`pol protinapad`, half counter-attack) before the defence is set.

## Positions

| Slovenian (API `igralnoMesto`) | English | What they do | Typical shots |
|---|---|---|---|
| `Vratar` | goalkeeper | Stops shots, starts fast breaks | – |
| `Levi zunanji` | left back | Long-range shooter and playmaker on the left | 9m, some 6m |
| `Srednji zunanji` | centre back (playmaker) | Organises the attack, often takes the 7m | 9m and 6m, many 7m |
| `Desni zunanji` | right back (usually left-handed) | Long-range shooter on the right | 9m, some 6m |
| `Levo krilo` | left wing | Runs the fast breaks, shoots from narrow angles | wing, fast-break 6m |
| `Desno krilo` | right wing (usually left-handed) | Same on the right | wing, fast-break 6m |
| `Krožni napadalec` | pivot / line player | Plays among the defenders at the 6 m line, blocks for teammates, draws fouls and 7m | 6m |

"Zunanji" = "outer" (the backs), "krilo" = wing, "krožni" = circle/line.

## Typical numbers (Liga NLB 2026/27, rounds 1–8)

| Measure | Typical | Good | Poor |
|---|---|---|---|
| Field-shot % (goals / attempts excl. 7m), backs | 61–67% | 72%+ | below 55% |
| Field-shot %, wings | 69–70% | 78%+ | below 60% |
| Field-shot %, pivots | 77% | 85%+ | below 68% |
| 9m shots (long range) | 57–58% | 65%+ | below 45% |
| 6m shots | 73–81% | | |
| 7m conversion | 76% | 85%+ | below 65% |
| Goalkeeper save % (of shots on target) | 25% | 30%+ | below 20% |
| 2min per match, field player | 0.31 (pivots 0.57) | | 1+ |

"Typical" is measured; "good" and "poor" are rough guides. These percentages count saved and missed shots as failures. International numbers are a bit different, so don't compare them with these one to one. Shooting % at lower levels looks just as high because the opponents are weaker too (see [player-insights.md](player-insights.md#comparing-across-leagues)).

## Competitions and age groups

| Term | Meaning |
|---|---|
| `RZS` | Rokometna zveza Slovenije, the Slovenian handball federation |
| `SRL` | Slovenska rokometna liga (Slovenian handball league) |
| `Liga NLB (1. SRL)` | men's top division (sponsor name NLB) |
| `1. B SRL` | men's second division |
| `2. SRL` | men's third division |
| `1. SRL – ženske` | women's top division |
| `Pokal Slovenije` | Slovenian cup |
| `Super pokal` | super cup (champion vs cup winner) |
| `SRT` | regional youth competitions (groups `CENTER`, `VZHOD` east, `ZAHOD` west, `JUG` south) |
| `Kvalifikacije` | qualification stage |
| `Član` / `Člani` | senior men |
| `Članice` | senior women |
| `M20`, `M17`, `M15`, `M14` | men/boys under 20, 17, 15, 14 |
| `Ž19`, `Ž17`, `Ž15`, `Ž14` | women/girls under 19, 17, 15, 14 (`Ž` = ženske, women) |
| `Mladinci` | juniors (≈ M20) |
| `Kadeti` | cadets (≈ M17) |
| `Starejši dečki A / B` | older boys (≈ U15 / U14) |
| `Mlajši dečki A / B` | younger boys (≈ U13 / U12) |
| `selekcija` | age group |
| `kategorija`, `vrstaLige` | category (e.g. Člani) |

## API and PDF terms

### General

| Term | Meaning |
|---|---|
| `sezona` | season |
| `liga` | league / competition |
| `krog`, `krogDolgo` | round (`"8"`, `"08.KROG"`) |
| `tekma`, `tekme` | match, matches |
| `ekipa`, `ekipe` | team; in play-by-play `ekipa` 1 = home, 2 = away |
| `klub` | club (one club can have many teams: seniors, youth) |
| `domači`, `domaca_ekipa` | home (team) |
| `gosti`, `gostujoca_ekipa` | away / visitors |
| `Ekipa A` / `Ekipa B` | home / away team (PDF) |
| `igralec`, `igralci` | player, players |
| `igralecIme`, `ime`, `priimek`, `polno_ime` | first name, first name (or team name in some lists), surname, full name |
| `stevilka`, `stevilkaIgralec`, `st_dresa`, `Št.` | number: shirt number (`st_dresa`), or rank in a list (`stevilka`) |
| `igralnoMesto`, `pozicija` | position |
| `licenca` | player licence number |
| `datum_rojstva`, `starost` | date of birth, age |
| `drzavljanstvo`, `spol` | citizenship, gender (1 = male) |
| `trenutniKlub`, `posojenKlub`, `Zadnji_klub_krog` | current club, loan club, last club in that round |
| `datumTekme`, `datumCler`, `cas`, `cas_tekme` | match date, date, kick-off time; in play-by-play `cas_tekme` = second of play (0–3600) |
| `dantekme` | weekday |
| `dvorana`, `nazivDvorane`, `Lokacija igranja` | hall / venue |
| `gledalci` | spectators |
| `sodnik`, `prvisoednik`, `drugiSodnik`, `delegat` | referee, first and second referee, match delegate |
| `trener`, `pomocnik`, `vodja moštva`, `fizioterapevt` | coach, assistant, team manager, physio |
| `status` | 1 = played, 10 = live |
| `ulica`, `hisna_st`, `postna_st`, `mesto`, `posta`, `kraj`, `naslov` | street, house number, postcode, town, postcode, place, address |
| `sedisca` | seats (hall capacity) |

### Results and tables

| Term | Meaning |
|---|---|
| `Rezultat polčas`, `goli_*_polcas`, `domaciPolcas` | half-time score |
| `Rezultat Konec`, `goli_*_konec` | final score |
| `lestvica` | standings table |
| `tocke` | points |
| `zmaga`, `poraz`, `neod` / `neodloceno` | win, loss, draw |
| `goli_plus`, `goli_minus`, `goli_razmerje`, `razlikaZadetki` | goals for, goals against, goal difference, "for:against" |
| `tekem`, `st_tekem`, `steviloTekem` | matches played |
| `forma`, `formaEkipa` | form (recent results) |
| `razpored` | schedule |
| `naslednjiKrog`, `zadnjiOdigranKrog` | next round, last played round |
| `strelci`, `lestvicaStrelci` | (top) scorers |
| `statistika` | statistics |
| `prenos_tock` | points carried over (between league stages) |

### Shooting, goalkeeping, discipline

| Term | Meaning |
|---|---|
| `zadetki`, `zadetkov`, `Goli`, `st_zadetkov` | goals |
| `streli`, `strelov`, `steviloStrelov`, `st_strelov`, `Streli` | shots / attempts |
| `poskusi` | attempts |
| `procent`, `proc_usp_*`, `%` | percentage, success rate |
| `st_zadetkov_tekma`, `goliNatkmo` | goals per match |
| `7m`, `sedem_m`, `sedemmetrovke`, `zadetki_7m`, `poskusi_7m` | 7 m penalties: goals, attempts |
| `6m` | shots from close range (at the 6 m line, incl. pivot shots and breakthroughs) |
| `9m` | long-range shots (around or behind the 9 m line) |
| `Krilo` | wing shots |
| `Mimo` | missed (wide or over), shot that did not hit the target |
| `Pos. obr.` (`postavljena obramba`, PDF typo `Postvljena`) | against a set defence |
| `Pol PN` (`pol protinapad`) | secondary wave / half counter-attack |
| `Hiter PN` (`hiter protinapad`) | fast break |
| `Ni pod.`, `Ni podat.` (`ni podatka`) | no data / type not recorded |
| `Zadetki glede na vrsto napada` | goals by attack type |
| `vratar` | goalkeeper (`vratar: 1` = is a goalkeeper) |
| `obrambe` | saves (literally "defences") |
| `steviloMetov` | shots faced (on target) |
| `sedemObrambe`, `sedemVsi` | 7m saved, 7m faced |
| `Vse obrambe/streli` | all saves / shots (goalkeeper table header) |
| `Vsi zadetki/streli` | all goals / shots (player table header) |
| `V NAPADU` / `V OBRAMBI` | in attack (the team's own shots) / in defence (shots against it) |
| `Kazni` | penalties / sanctions (cards and suspensions) |
| `izkljucitve`, `iskljucitve`, `2min` | 2-minute suspensions |
| `RUM`, `rumeni_karton`, `opomini` | yellow cards / warnings |
| `RDE`, `rdeci_kartoni`, `rdecKarton`, `diskvalifikacije` | red cards / disqualifications |
| `Skupaj` | total |

### "Ostale akcije" (other actions, PDF pages 2/4)

| Term | Meaning |
|---|---|
| `Akcije +` / `Akcije -` | positive / negative actions |
| `Prekršek +` | foul drawn (free throw won) |
| `Podaja +` | assist (pass leading to a goal) |
| `Blok +` | block (defender blocks a shot) |
| `Žoga +` | ball won (steal / interception) |
| `7 +` | 7 m penalty drawn |
| `2min +` | 2min, as listed in this table (in the data checked it equals the player's own suspensions) |
| `Žoga -` | ball lost (turnover) |
| `Blok -` | own shot blocked |
| `7m -` | 7 m penalty caused (foul in defence) |
| `Koraki -` | steps (travelling: more than 3 steps with the ball) |

Recorded only at some venues; see [player-insights.md](player-insights.md#ostale-akcije-table-pdf-pages-2-and-4).

### Play-by-play (`naziv_akcije`)

| Term | Meaning |
|---|---|
| `Strel na gol` | shot at goal (`vrednost_akcije` 1 = goal, 0 = saved, -1 = missed) |
| `Strel na gol - Vratar` | the same shot from the goalkeeper's side |
| `7M`, `7M -Vratar` | 7 m penalty, shooter's side / goalkeeper's side |
| `2min-` | 2-minute suspension |
| `Rum. karton`, `Rdec. karton` | yellow card, red card |
| `Minuta` | team time-out |
| `Začetek tekme`, `Konec prvi polčas`, `Začetek drugi polčas`, `Konec tekme` | start of match, end of first half, start of second half, end of match |
| `sodelujoci` | the player involved (name) |
| `minuta` | minute |
| `koordinata_strela_start/end` | shot coordinates (always empty) |
| `akcije` | actions / events |
