"""Team tools on data/stats.db: Elo ratings, win probabilities, clubs near a place.

Usage:
  python3 scripts/teams.py elo [COMPETITION_TEXT]       Elo table for the teams of a competition this season
                                                        (default "NLB"; e.g. "1. B SRL", "ženske", "M20 1.")
  python3 scripts/teams.py predict HOME_TEAM_ID AWAY_TEAM_ID   win probability with today's ratings
  python3 scripts/teams.py validate                     how well pre-match Elo predicted this season
  python3 scripts/teams.py near TOWN_OR_POSTCODE [N]    clubs by distance (needs scripts/clubs.py to have run)

Elo is the same algorithm as src/lib/stats/elo.ts (specs/stats-pipeline.md, "Team Elo"); keep the two in step.
"""
import math
import os
import re
import sqlite3
import sys
import unicodedata

DB = os.environ.get("STATS_DB_PATH") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "stats.db")

START = 1500       # rating of a top-level team on its first appearance
LEVEL_STEP = 100   # each division below the top starts this much lower (1. B SRL 1400, 2. SRL 1300)
K = 30             # update size per match, before the goal-difference multiplier
CARRY = 2 / 3      # share of last season's distance from the seed kept into the new season
HFA_DEFAULT = 40   # home advantage in rating points when there are too few matches to fit it

CUP = re.compile(r"POKAL", re.I)


def pool_of(name):
    """Rating pool: the age/gender group in the last brackets, e.g. 'Liga NLB (1. SRL) (Člani)' -> 'Člani'."""
    m = re.findall(r"\(([^()]*)\)", name)
    return m[-1].strip() if m else name


def level_of(name):
    """Division level inside a pool: 0 top, 1 '1. B', 2 '2. …', 3 '3. …'; None for cups."""
    if CUP.search(name):
        return None
    if re.search(r"\b1\. ?B\b", name):
        return 1
    m = re.search(r"\b([23])\. ?(?:B )?(?:SRL|liga)", name, re.I)
    return int(m.group(1)) if m else 0


def expected(diff):
    return 1 / (1 + 10 ** (-diff / 400))


def margin_mult(gd, winner_diff):
    """ln(goal difference + 1), damped when the favourite wins (FiveThirtyEight-style); 1 for a draw."""
    if gd == 0:
        return 1.0
    return math.log(abs(gd) + 1) * 2.2 / (max(-1000, winner_diff) * 0.001 + 2.2)


def fit_home_advantage(matches):
    """Rating points that make the expected home score equal the observed one (league matches only)."""
    league = [m for m in matches if level_of(m["competition"]) is not None]
    if len(league) < 50:
        return HFA_DEFAULT
    s = sum(1 if m["hg"] > m["ag"] else 0.5 if m["hg"] == m["ag"] else 0 for m in league) / len(league)
    s = min(0.75, max(0.5, s))
    return round(400 * math.log10(s / (1 - s)))


def date_key(d):
    return f"{d[6:10]}{d[3:5]}{d[0:2]}" if d and len(d) >= 10 else ""


def load(db):
    db.row_factory = sqlite3.Row
    return [dict(r) for r in db.execute(
        """SELECT m.id, m.season_id, m.date, m.time, m.status, m.home_team_id AS home_id, m.away_team_id AS away_id,
                  m.home, m.away, m.home_goals AS hg, m.away_goals AS ag, c.name AS competition, m.competition_id
           FROM matches m JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
           WHERE m.status IN (0, 1) AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL""")]


def compute(matches, k=K, level_step=LEVEL_STEP, hfa=None):
    """Run Elo over played matches in date order. Returns (ratings, history, predictions, hfa).

    ratings[(pool, team_id)] = current rating; history[(pool, team_id)] = list of dicts per match;
    predictions = list of (match, p_home_win_expected, outcome) made with pre-match ratings.
    """
    played = sorted((m for m in matches if m["status"] == 1 and m["hg"] is not None),
                    key=lambda m: (m["season_id"], date_key(m["date"]), m["time"] or "", m["id"]))
    hfa = fit_home_advantage(played) if hfa is None else hfa
    # Each team's division level per season and pool (lowest-numbered league it plays in), dense-ranked per pool.
    levels, team_level = {}, {}
    for m in played:
        lv = level_of(m["competition"])
        if lv is None:
            continue
        key = (m["season_id"], pool_of(m["competition"]))
        levels.setdefault(key, set()).add(lv)
        for t in (m["home_id"], m["away_id"]):
            tk = key + (t,)
            team_level[tk] = min(team_level.get(tk, lv), lv)
    rank = {key: {lv: i for i, lv in enumerate(sorted(v))} for key, v in levels.items()}

    def seed(season, pool, team):
        r = rank.get((season, pool), {0: 0})
        lv = team_level.get((season, pool, team))
        return START - level_step * (r[lv] if lv is not None else len(r))

    ratings, season_of, history, predictions = {}, {}, {}, []
    for m in played:
        pool = pool_of(m["competition"])
        pre = []
        for t in (m["home_id"], m["away_id"]):
            key = (pool, t)
            if season_of.get(key) != m["season_id"]:
                s = seed(m["season_id"], pool, t)
                ratings[key] = s + (ratings[key] - s) * CARRY if key in ratings else s
                season_of[key] = m["season_id"]
            pre.append(ratings[key])
        diff = pre[0] + hfa - pre[1]
        e = expected(diff)
        score = 1 if m["hg"] > m["ag"] else 0.5 if m["hg"] == m["ag"] else 0
        gd = m["hg"] - m["ag"]
        delta = k * margin_mult(gd, diff if gd > 0 else -diff) * (score - e)
        predictions.append((m, e, score))
        for i, (t, opp, sign) in enumerate(((m["home_id"], m["away"], 1), (m["away_id"], m["home"], -1))):
            key = (pool, t)
            ratings[key] = pre[i] + sign * delta
            res = "D" if gd == 0 else "W" if (gd > 0) == (sign == 1) else "L"
            history.setdefault(key, []).append({
                "match_id": m["id"], "season_id": m["season_id"], "date": m["date"], "competition": m["competition"],
                "name": m["home"] if sign == 1 else m["away"], "opponent": opp, "result": res,
                "before": pre[i], "after": ratings[key], "delta": sign * delta})
    return ratings, history, predictions, hfa


def score_predictions(preds, base_p):
    """Accuracy on decisive matches and Brier score (draw = 0.5) for Elo and for a constant home-win rate."""
    decisive = [(e, s) for _, e, s in preds if s != 0.5]
    n = len(preds)
    return {
        "matches": n, "decisive": len(decisive),
        "elo_accuracy": sum((e > 0.5) == (s == 1) for e, s in decisive) / max(1, len(decisive)),
        "home_accuracy": sum(s == 1 for _, s in decisive) / max(1, len(decisive)),
        "elo_brier": sum((e - s) ** 2 for _, e, s in preds) / max(1, n),
        "home_brier": sum((base_p - s) ** 2 for _, _, s in preds) / max(1, n),
    }


def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def cmd_elo(db, text="NLB"):
    matches = load(db)
    ratings, history, _, hfa = compute(matches)
    season = max(m["season_id"] for m in matches)
    comps = {m["competition"] for m in matches if m["season_id"] == season and fold(text) in fold(m["competition"])}
    if not comps:
        sys.exit(f"No competition this season matches {text!r}.")
    teams = {}
    for m in matches:
        if m["season_id"] == season and m["competition"] in comps and m["status"] == 1:
            pool = pool_of(m["competition"])
            teams[(pool, m["home_id"])] = teams[(pool, m["away_id"])] = None
    rows = sorted(((ratings[k], k) for k in teams if k in ratings), reverse=True)
    print(f"Elo, season {season}, {', '.join(sorted(comps))} (home advantage {hfa} points, pool: {', '.join(sorted({k[0] for k in teams}))})\n")
    print("| # | Team | team_id | Elo | Last 5 change | Last 5 | Matches |")
    print("|---|---|---|---|---|---|---|")
    for i, (r, k) in enumerate(rows, 1):
        h = [x for x in history[k] if x["season_id"] == season]
        last = h[-5:]
        print(f"| {i} | {h[-1]['name']} | {k[1]} | {r:.0f} | {sum(x['delta'] for x in last):+.0f} | "
              f"{''.join(x['result'] for x in last)} | {len(h)} |")


def cmd_predict(db, home, away):
    matches = load(db)
    ratings, history, _, hfa = compute(matches)
    by_team = {}
    for (pool, t), r in ratings.items():
        by_team.setdefault(t, []).append((len(history[(pool, t)]), pool, r))
    if home not in by_team or away not in by_team:
        sys.exit("Unknown team id (no played match).")
    common = {p for _, p, _ in by_team[home]} & {p for _, p, _ in by_team[away]}
    if not common:
        sys.exit("These teams are rated in different groups (age/gender), so there is no prediction.")
    pool = max(common, key=lambda p: len(history[(p, home)]))
    rh, ra = ratings[(pool, home)], ratings[(pool, away)]
    e = expected(rh + hfa - ra)
    print(f"{history[(pool, home)][-1]['name']} ({rh:.0f}) at home vs {history[(pool, away)][-1]['name']} ({ra:.0f}), "
          f"home advantage {hfa}: home win chance {e * 100:.0f}% (draws count as half; handball draws are ~5%).")


def cmd_validate(db):
    matches = load(db)
    season = max(m["season_id"] for m in matches)
    for k in (10, 15, 20, 25, 30, 40):
        for step in (0, 50, 100, 150):
            _, _, preds, hfa = compute(matches, k=k, level_step=step)
            cur = [p for p in preds if p[0]["season_id"] == season]
            base = expected(hfa)
            r = score_predictions(cur, base)
            if k == K and step == LEVEL_STEP or "-v" in sys.argv:
                print(f"K={k} step={step} hfa={hfa}: {r['matches']} matches ({r['decisive']} decisive), "
                      f"Elo accuracy {r['elo_accuracy']:.3f} vs home-wins {r['home_accuracy']:.3f}; "
                      f"Brier Elo {r['elo_brier']:.4f} vs constant home rate {r['home_brier']:.4f}")
    _, history, preds, hfa = compute(matches)
    seen, later = {}, []
    for p in preds:
        m = p[0]
        if m["season_id"] == season and seen.get(m["home_id"], 0) >= 3 and seen.get(m["away_id"], 0) >= 3:
            later.append(p)
        for t in (m["home_id"], m["away_id"]):
            seen[t] = seen.get(t, 0) + 1
    r = score_predictions(later, expected(hfa))
    print(f"Both teams with 3+ earlier matches: {r['matches']} matches, Elo accuracy {r['elo_accuracy']:.3f} vs "
          f"home-wins {r['home_accuracy']:.3f}; Brier {r['elo_brier']:.4f} vs {r['home_brier']:.4f}")


def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def cmd_near(db, place, n=10):
    db.row_factory = sqlite3.Row
    try:
        pcs = [dict(r) for r in db.execute("SELECT postcode, place, lat, lon FROM postcodes")]
    except sqlite3.OperationalError:
        sys.exit("No clubs table yet: run python3 scripts/clubs.py first.")
    q = fold(place.strip())
    hit = next((p for p in pcs if p["postcode"] == q), None) or next((p for p in pcs if fold(p["place"]) == q), None) \
        or next((p for p in pcs if fold(p["place"]).startswith(q)), None)
    if not hit:
        sys.exit(f"Unknown town or postcode {place!r}.")
    season = db.execute("SELECT max(season_id) FROM team_clubs").fetchone()[0]
    clubs = [dict(r) for r in db.execute("SELECT * FROM clubs WHERE lat IS NOT NULL")]
    teams = {}
    for r in db.execute("""SELECT tc.club_id, tc.team_id, max(c.name) AS competition FROM team_clubs tc
                           JOIN competitions c ON c.id = tc.competition_id AND c.season_id = tc.season_id
                           WHERE tc.season_id = ? GROUP BY tc.club_id, tc.team_id""", (season,)):
        teams.setdefault(r["club_id"], []).append(f"{r['competition']} ({r['team_id']})")
    for c in clubs:
        c["km"] = haversine((hit["lat"], hit["lon"]), (c["lat"], c["lon"]))
    clubs = sorted((c for c in clubs if c["id"] in teams), key=lambda c: c["km"])[:n]
    print(f"Clubs near {hit['postcode']} {hit['place']} (distance between postcode centres, straight line)\n")
    print("| km | Club | club_id | Town | Teams this season (team_id) |")
    print("|---|---|---|---|---|")
    for c in clubs:
        print(f"| {c['km']:.0f} | {c['name']} | {c['id']} | {c['postcode']} {c['town']} | {'; '.join(sorted(teams[c['id']]))} |")


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("elo", "predict", "validate", "near"):
        sys.exit(__doc__)
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
    if a[0] == "elo":
        cmd_elo(db, " ".join(a[1:]) or "NLB")
    elif a[0] == "predict" and len(a) == 3:
        cmd_predict(db, int(a[1]), int(a[2]))
    elif a[0] == "validate":
        cmd_validate(db)
    elif a[0] == "near" and len(a) >= 2:
        n = int(a[-1]) if len(a) > 2 and a[-1].isdigit() else 10
        cmd_near(db, " ".join(a[1:-1] if len(a) > 2 and a[-1].isdigit() else a[1:]), n)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
