"""Fill the clubs, team_clubs and postcodes tables in stats.db (for "near you", /stats/near).

Usage: python3 scripts/clubs.py [SEASON_ID|current]   (run after scripts/crawl.py; scripts/crawler-loop.sh does)
Per competition of the season: GET /podatkiLiga/{league}/sezona/{season}/klubi (cached like the crawler,
1 request per second), keeps the club's id, name and address (street, postcode, town) and the team ids.
Contact people, phones and e-mails in that response are not stored. Coordinates come from the club's
postcode via scripts/data/si_postcodes.csv (GeoNames, CC BY 4.0), so they are a postcode centre, not the hall.
Team -> club also comes from the matches (home_club_id / away_club_id). See specs/stats-pipeline.md.
"""
import csv
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crawl  # noqa: E402  (fetch + cache, same STATS_DATA_DIR)

crawl.DELAY = 1.0
POSTCODES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "si_postcodes.csv")

SCHEMA = """
CREATE TABLE IF NOT EXISTS clubs (id INTEGER PRIMARY KEY, name TEXT, street TEXT, postcode TEXT, town TEXT,
    lat REAL, lon REAL);
CREATE TABLE IF NOT EXISTS team_clubs (team_id INTEGER, season_id INTEGER, competition_id INTEGER, club_id INTEGER,
    PRIMARY KEY (team_id, season_id, competition_id));
CREATE TABLE IF NOT EXISTS postcodes (postcode TEXT PRIMARY KEY, place TEXT, lat REAL, lon REAL);
"""


def load_postcodes(db):
    with open(POSTCODES, encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(line for line in f if not line.startswith("#"))]
    db.executemany("INSERT OR REPLACE INTO postcodes VALUES (?,?,?,?)",
                   [(r["postcode"], r["place"], float(r["lat"]), float(r["lon"])) for r in rows])
    return ({r["postcode"]: (float(r["lat"]), float(r["lon"])) for r in rows},
            {r["place"].lower(): (float(r["lat"]), float(r["lon"])) for r in rows},
            {r["postcode"]: r["place"].split("/")[0] for r in rows})


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "current"
    os.makedirs(crawl.CACHE, exist_ok=True)
    db = sqlite3.connect(os.path.join(crawl.DATA, "stats.db"), timeout=120)
    db.execute("PRAGMA journal_mode = WAL")
    db.executescript(SCHEMA)
    by_pc, by_place, places = load_postcodes(db)
    sid = db.execute("SELECT max(id) FROM seasons").fetchone()[0] if arg == "current" else int(arg)
    comps = [r[0] for r in db.execute("SELECT id FROM competitions WHERE season_id = ?", (sid,))]
    clubs, located = {}, 0
    for lid in comps:
        teams = (crawl.api(f"/podatkiLiga/{lid}/sezona/{sid}/klubi") or {}).get("ekipeLige") or []
        for t in teams:
            k = t.get("klub") or {}
            if not k.get("id"):
                continue
            street = " ".join(x for x in ((k.get("ulica") or "").strip(), (k.get("hisna_st") or "").strip()) if x)
            street = re.sub(r",?\s*p\.\s*p\.(\s*\d+)?\s*$", "", street).strip()  # drop "p.p." (PO box)
            pc = (k.get("postna_st") or "").strip()
            town = re.sub(r"^p\.\s*p\.\s*\d*\s*,\s*", "", (k.get("mesto") or "").strip())
            town = places.get(pc) or town.title()  # the post office name, nicely cased
            clubs[k["id"]] = (k["id"], (k.get("ime") or k.get("label") or "").strip(), street, pc, town)
            db.execute("INSERT OR REPLACE INTO team_clubs VALUES (?,?,?,?)", (t.get("id"), sid, lid, k["id"]))
    for cid, name, street, pc, town in clubs.values():
        ll = by_pc.get(pc) or by_place.get(town.lower()) or (None, None)
        located += ll[0] is not None
        db.execute("INSERT OR REPLACE INTO clubs VALUES (?,?,?,?,?,?,?)", (cid, name, street, pc, town, *ll))
    # Played matches also say which club each team belongs to (covers teams the klubi list leaves out).
    db.execute("""INSERT OR IGNORE INTO team_clubs
                  SELECT home_team_id, season_id, competition_id, max(home_club_id) FROM matches
                  WHERE season_id = ? AND home_club_id IS NOT NULL GROUP BY 1, 2, 3
                  UNION ALL
                  SELECT away_team_id, season_id, competition_id, max(away_club_id) FROM matches
                  WHERE season_id = ? AND away_club_id IS NOT NULL GROUP BY 1, 2, 3""", (sid, sid))
    db.commit()
    missing = db.execute("SELECT count(DISTINCT club_id) FROM team_clubs WHERE season_id = ? AND club_id NOT IN "
                         "(SELECT id FROM clubs)", (sid,)).fetchone()[0]
    print(f"season {sid}: {len(comps)} competitions, {len(clubs)} clubs, {located} with coordinates, "
          f"{missing} clubs only known from matches (no address)", flush=True)


if __name__ == "__main__":
    main()
