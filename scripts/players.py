"""Player tools on data/stats.db: profile with weak spots, similar players, rankings.

Usage:
  python3 scripts/players.py find NAME                 players whose name contains NAME
  python3 scripts/players.py profile PLAYER_ID         season profile vs position average, weak spots
  python3 scripts/players.py similar PLAYER_ID [N]     most similar field players (same season)
  python3 scripts/players.py rank METRIC [POSITION] [COMPETITION_TEXT]
        METRIC: goals | shooting | 7m | goals_per_match | two_min ; POSITION e.g. "Levo krilo"
Numbers come only from stats.db. Shooting % rankings are shrunk toward the average (K shots of the
average), so a player with 2/2 doesn't rank as 100%. Built from JSON player stats; shot types
(6m / wing / 9m) need the PDF player table (scripts/parse_players.py) and are not in here yet.
"""
import math
import os
import sqlite3
import sys

DB = os.environ.get("STATS_DB_PATH") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "stats.db")
K = 20          # shrinkage: shots of "average" added to each player's shooting %
MIN_SHOTS = 15  # below this, a shooting % claim isn't worth making

SEASON_SQL = """
SELECT p.player_id, p.first_name || ' ' || p.last_name AS name, p.position,
       (SELECT CASE p2.side WHEN 'home' THEN m2.home ELSE m2.away END FROM player_match p2
          JOIN matches m2 ON m2.id = p2.match_id WHERE p2.player_id = p.player_id
          ORDER BY m2.id DESC LIMIT 1) AS team,
       group_concat(DISTINCT c.name) AS competitions,
       count(*) AS matches, sum(p.goals) AS goals, sum(p.shots) AS shots,
       sum(p.goals_7m) AS goals_7m, sum(p.shots_7m) AS shots_7m,
       sum(p.two_min) AS two_min, sum(p.yellow) AS yellow, sum(p.red) AS red
FROM player_match p JOIN matches m ON m.id = p.match_id
JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
WHERE p.is_goalkeeper = 0 {where}
GROUP BY p.player_id
"""


def rows(db, where="", args=()):
    db.row_factory = sqlite3.Row
    return [dict(r) for r in db.execute(SEASON_SQL.format(where=where), args)]


def pct(g, s):
    return 100.0 * g / s if s else None


def fmt(v, unit="%"):
    return "–" if v is None else f"{v:.0f}{unit}"


def position_averages(players):
    acc = {}
    for p in players:
        a = acc.setdefault(p["position"], {"goals": 0, "shots": 0, "g7": 0, "s7": 0, "two": 0, "m": 0, "n": 0})
        a["goals"] += p["goals"] or 0
        a["shots"] += p["shots"] or 0
        a["g7"] += p["goals_7m"] or 0
        a["s7"] += p["shots_7m"] or 0
        a["two"] += p["two_min"] or 0
        a["m"] += p["matches"]
        a["n"] += 1
    return acc


def profile(db, pid):
    me = rows(db, "AND p.player_id = ?", (pid,))
    if not me:
        sys.exit(f"no field-player stats for player {pid}")
    me = me[0]
    comp_ids = [r[0] for r in db.execute(
        "SELECT DISTINCT m.competition_id FROM player_match p JOIN matches m ON m.id=p.match_id WHERE p.player_id=?", (pid,))]
    peers = rows(db, f"AND m.competition_id IN ({','.join('?' * len(comp_ids))})", comp_ids)
    avg = position_averages(peers).get(me["position"])
    print(f"{me['name']} (id {pid}) | {me['position']} | {me['team']} | {me['competitions']}")
    print(f"{me['matches']} matches, {me['goals']} goals from {me['shots']} shots, "
          f"7m {me['goals_7m']}/{me['shots_7m']}, 2min {me['two_min']}, yellow {me['yellow']}, red {me['red']}")

    my = {"shooting": pct(me["goals"], me["shots"]),
          "field": pct(me["goals"] - me["goals_7m"], me["shots"] - me["shots_7m"]),
          "7m": pct(me["goals_7m"], me["shots_7m"]),
          "gpm": me["goals"] / me["matches"], "two": me["two_min"] / me["matches"]}
    base = {"shooting": pct(avg["goals"], avg["shots"]),
            "field": pct(avg["goals"] - avg["g7"], avg["shots"] - avg["s7"]),
            "7m": pct(avg["g7"], avg["s7"]), "gpm": avg["goals"] / avg["m"], "two": avg["two"] / avg["m"]}
    print(f"\nvs average {me['position']} in the same competition(s) ({avg['n']} players):")
    print(f"  shooting %           {fmt(my['shooting']):>5}  vs {fmt(base['shooting'])}")
    print(f"  field shooting %     {fmt(my['field']):>5}  vs {fmt(base['field'])}   (without 7m)")
    print(f"  7m %                 {fmt(my['7m']):>5}  vs {fmt(base['7m'])}")
    print(f"  goals per match      {my['gpm']:>5.1f}  vs {base['gpm']:.1f}")
    print(f"  2min per match       {my['two']:>5.2f}  vs {base['two']:.2f}")

    form = list(db.execute("""SELECT m.date, CASE p.side WHEN 'home' THEN m.away ELSE m.home END, p.goals, p.shots
        FROM player_match p JOIN matches m ON m.id=p.match_id WHERE p.player_id=? ORDER BY m.id""", (pid,)))
    print("\nmatch by match: " + ", ".join(f"{g}/{s}" for _, _, g, s in form))

    print("\nweak spots (only claims with enough attempts):")
    found = False
    field_shots = me["shots"] - me["shots_7m"]
    if field_shots >= MIN_SHOTS and my["field"] is not None and my["field"] < base["field"] - 8:
        print(f"  - field shooting {fmt(my['field'])} from {field_shots} shots, below the {fmt(base['field'])} position average")
        found = True
    if me["shots_7m"] >= 6 and my["7m"] is not None and base["7m"] and my["7m"] < base["7m"] - 12:
        print(f"  - 7m: {me['goals_7m']}/{me['shots_7m']} ({fmt(my['7m'])}), position average {fmt(base['7m'])}")
        found = True
    if me["matches"] >= 4 and my["two"] > max(0.5, 2 * base["two"]):
        print(f"  - discipline: {my['two']:.2f} two-minute suspensions per match, average {base['two']:.2f}")
        found = True
    if not found:
        print("  - none with enough data yet" + (f" (only {field_shots} field shots)" if field_shots < MIN_SHOTS else ""))


def features(p):
    s = p["shots"] or 0
    return [p["goals"] / p["matches"], s / p["matches"],
            (p["goals"] - p["goals_7m"]) / max(1, s - p["shots_7m"]),
            (p["shots_7m"] or 0) / max(1, s), (p["two_min"] or 0) / p["matches"]]


def similar(db, pid, n=10):
    season = db.execute("SELECT m.season_id FROM player_match p JOIN matches m ON m.id=p.match_id WHERE p.player_id=? "
                        "ORDER BY m.id DESC LIMIT 1", (pid,)).fetchone()
    pool = [p for p in rows(db, "AND m.season_id = ?", (season[0],)) if (p["shots"] or 0) >= MIN_SHOTS or p["player_id"] == pid]
    me = next((p for p in pool if p["player_id"] == pid), None)
    if not me:
        sys.exit("player not found")
    feats = [features(p) for p in pool]
    cols = list(zip(*feats))
    mean = [sum(c) / len(c) for c in cols]
    sd = [math.sqrt(sum((x - mu) ** 2 for x in c) / len(c)) or 1 for c, mu in zip(cols, mean)]
    z = lambda f: [(x - mu) / s for x, mu, s in zip(f, mean, sd)]
    mz = z(features(me))
    scored = []
    for p, f in zip(pool, feats):
        if p["player_id"] == pid:
            continue
        d = math.dist(mz, z(f)) + (0.75 if p["position"] != me["position"] else 0)
        scored.append((d, p))
    print(f"most similar to {me['name']} ({me['position']}, {me['team']}), {len(pool)} players with {MIN_SHOTS}+ shots:")
    for d, p in sorted(scored, key=lambda x: x[0])[:n]:
        print(f"  {d:4.2f}  {p['name']:<28} {p['position']:<20} {p['team']:<32} "
              f"{p['goals']}/{p['shots']} in {p['matches']}, 7m {p['goals_7m']}/{p['shots_7m']}")


def rank(db, metric, position=None, comp=None, n=20):
    where, args = "", []
    if position:
        where += " AND p.position = ?"
        args.append(position)
    if comp:
        where += " AND c.name LIKE ?"
        args.append(f"%{comp}%")
    ps = rows(db, where, args)
    tot_g, tot_s = sum(p["goals"] for p in ps), sum(p["shots"] or 0 for p in ps)
    avg = tot_g / tot_s if tot_s else 0
    g7, s7 = sum(p["goals_7m"] or 0 for p in ps), sum(p["shots_7m"] or 0 for p in ps)
    avg7 = g7 / s7 if s7 else 0
    keys = {
        "goals": (lambda p: p["goals"], "goals"),
        "goals_per_match": (lambda p: p["goals"] / p["matches"] if p["matches"] >= 3 else -1, "goals/match (3+ matches)"),
        "shooting": (lambda p: (p["goals"] + K * avg) / ((p["shots"] or 0) + K) if (p["shots"] or 0) >= MIN_SHOTS else -1,
                     f"shooting % shrunk to avg {avg:.0%}, {MIN_SHOTS}+ shots"),
        "7m": (lambda p: (p["goals_7m"] + 5 * avg7) / (p["shots_7m"] + 5) if p["shots_7m"] >= 5 else -1,
               f"7m % shrunk to avg {avg7:.0%}, 5+ attempts"),
        "two_min": (lambda p: p["two_min"], "two-minute suspensions"),
    }
    key, label = keys[metric]
    print(f"rank by {label}" + (f" | {position}" if position else "") + (f" | {comp}" if comp else ""))
    for i, p in enumerate(sorted((p for p in ps if key(p) >= 0), key=key, reverse=True)[:n], 1):
        print(f"{i:>3}. {p['name']:<28} {p['position']:<20} {p['team']:<32} {p['goals']}/{p['shots']} "
              f"in {p['matches']}, 7m {p['goals_7m']}/{p['shots_7m']}, 2min {p['two_min']}  (id {p['player_id']})")


def main():
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "find":
        for p in rows(db, "AND (p.first_name || ' ' || p.last_name) LIKE ?", (f"%{args[0]}%",)):
            print(p["player_id"], p["name"], "|", p["position"], "|", p["team"], "|", f"{p['goals']} goals in {p['matches']}")
    elif cmd == "profile":
        profile(db, int(args[0]))
    elif cmd == "similar":
        similar(db, int(args[0]), int(args[1]) if len(args) > 1 else 10)
    elif cmd == "rank":
        rank(db, args[0], args[1] if len(args) > 1 and args[1] else None, args[2] if len(args) > 2 else None)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
