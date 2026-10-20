"""Crawl one RZS season into SQLite (STATS_DATA_DIR/stats.db, default data/stats.db).

Usage: python3 scripts/crawl.py [SEASON_ID|current] [SHARD/SHARDS]   (pip install pypdf for goal zones)
       Run e.g. 0/3, 1/3, 2/3 in parallel to split the leagues over 3 processes.
Every match: detail + player stats (JSON). Top senior competitions also get play-by-play and PDF goal zones.
Match data is cached in STATS_DATA_DIR/cache, so a rerun only fetches what is new; season, league and
round lists are always fetched fresh. See specs/data-source.md and specs/stats-pipeline.md.
"""
import gzip
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
B = "https://infostat.rokometna-zveza.si/api/public"
DATA = os.environ.get("STATS_DATA_DIR") or os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
DELAY = 0.4
YOUTH = re.compile(r"\b[mž]\d{2}\b|mlad|kadet|deč|dekl|starejš|mlajš", re.I)
# Competitions that get play-by-play and the PDF (goal zones exist only in some of them; see specs/data-source.md).
ZONE_COMPETITIONS = re.compile(r"NLB|1\. ?SRL|2\. ?SRL|POKAL|1\. ?A\b", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS competitions (id INTEGER, season_id INTEGER, name TEXT, category TEXT,
    PRIMARY KEY (id, season_id));
CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, season_id INTEGER, competition_id INTEGER,
    round TEXT, date TEXT, time TEXT, status INTEGER,
    home_team_id INTEGER, away_team_id INTEGER, home_club_id INTEGER, away_club_id INTEGER,
    home TEXT, away TEXT, home_goals INTEGER, away_goals INTEGER, home_goals_ht INTEGER, away_goals_ht INTEGER,
    hall TEXT, attendance INTEGER, referee_a TEXT, referee_b TEXT, home_coach TEXT, away_coach TEXT,
    detail TEXT);  -- full: shots, goalkeepers, play-by-play exist (2019/20+); scorers: goals per player only
CREATE TABLE IF NOT EXISTS player_match (match_id INTEGER, team_id INTEGER, side TEXT, player_id INTEGER,
    first_name TEXT, last_name TEXT, number TEXT, position TEXT, is_goalkeeper INTEGER,
    goals INTEGER, shots INTEGER, goals_7m INTEGER, shots_7m INTEGER,
    yellow INTEGER, red INTEGER, two_min INTEGER, raw TEXT,
    PRIMARY KEY (match_id, side, player_id));
CREATE TABLE IF NOT EXISTS goalkeeper_match (match_id INTEGER, team_id INTEGER, side TEXT, player_id INTEGER,
    name TEXT, raw TEXT, PRIMARY KEY (match_id, side, player_id));
CREATE TABLE IF NOT EXISTS events (match_id INTEGER, seq INTEGER, minute INTEGER, second INTEGER, side TEXT,
    type TEXT, type_id INTEGER, value INTEGER, player TEXT, home_score INTEGER, away_score INTEGER,
    PRIMARY KEY (match_id, seq));
CREATE TABLE IF NOT EXISTS team_zones (match_id INTEGER, side TEXT, zone TEXT, goals INTEGER, shots INTEGER,
    PRIMARY KEY (match_id, side, zone));
CREATE TABLE IF NOT EXISTS team_shooting (match_id INTEGER, side TEXT, goals_7m INTEGER, shots_7m INTEGER,
    miss_over INTEGER, miss_left INTEGER, miss_right INTEGER, zone_goals INTEGER, PRIMARY KEY (match_id, side));
CREATE TABLE IF NOT EXISTS checks (match_id INTEGER, name TEXT, ok INTEGER, detail TEXT, PRIMARY KEY (match_id, name));
CREATE TABLE IF NOT EXISTS crawl_progress (key TEXT PRIMARY KEY, season_id INTEGER, season TEXT, shard TEXT,
    leagues_done INTEGER, leagues_total INTEGER, league TEXT, matches_new INTEGER, errors INTEGER, state TEXT,
    started_at TEXT, updated_at TEXT);
-- Every season RZS lists (pos 0 = newest), so /stats/crawl can show progress over all of them.
CREATE TABLE IF NOT EXISTS crawl_seasons (id INTEGER PRIMARY KEY, name TEXT, pos INTEGER);
"""


def fetch(path, form=None, fresh=False):
    """(content_type, body), cached on disk by path + form. fresh=True refetches and updates the cache."""
    key = hashlib.sha1((path + json.dumps(form, sort_keys=True)).encode()).hexdigest()
    fn = os.path.join(CACHE, key + ".gz")
    if os.path.exists(fn) and not fresh:
        with gzip.open(fn, "rb") as f:
            ctype, _, body = f.read().partition(b"\n")
        return ctype.decode(), body
    time.sleep(DELAY)
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    req = urllib.request.Request(B + path, data=data, headers={"X-Requested-With": "XMLHttpRequest"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                ctype, body = r.headers.get("Content-Type", ""), r.read()
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    with gzip.open(fn, "wb") as f:
        f.write(ctype.encode() + b"\n" + body)
    return ctype, body


def api(path, form=None, fresh=False):
    ctype, body = fetch(path, form, fresh)
    return json.loads(body).get("data") if "json" in ctype else None


def category(name):
    if YOUTH.search(name):
        return "youth"
    # Top flight across the years: Liga NLB / 1. SRL now, "1. NLB LEASING LIGA", "1. A DRŽAVNA ...",
    # "1. A MRL/ŽRL ..." and "1. A DRL ŽENSKE" in older seasons.
    if re.search(r"NLB|1\. ?SRL|1\. ?A\b", name, re.I):
        return "top"
    return "senior"


def season_year(season):
    """First year of a season name: '2019/2020' -> 2019, '2009' -> 2009."""
    return int(season["ime"][:4])


# Before 2019/20 RZS has results and goals per player only: no shots, goalkeepers, play-by-play or PDF.
FULL_DETAIL_FROM = 2019


def check(db, mid, name, ok, detail=""):
    db.execute("INSERT OR REPLACE INTO checks VALUES (?,?,?,?)", (mid, name, int(bool(ok)), str(detail)))


def safe_api(path):
    """(data, error). RZS answers 500 for single matches now and then; the match is loaded without that part."""
    try:
        return api(path), None
    except urllib.error.HTTPError as ex:
        return None, f"HTTP {ex.code}"
    except Exception as ex:
        return None, f"{type(ex).__name__}: {ex}"


def safe_fetch(path):
    try:
        return fetch(path), None
    except urllib.error.HTTPError as ex:
        return (None, None), f"HTTP {ex.code}"
    except Exception as ex:
        return (None, None), f"{type(ex).__name__}: {ex}"


def prefetch(mid, deep):
    """Download everything for a match into the cache before writing, so no DB lock is held during network calls."""
    det, _ = safe_api(f"/pregledTekme/{mid}")
    det = (det or {}).get("items") or {}
    for team, kind in ((det.get("id_domaci"), 1), (det.get("id_gosti"), 2)):
        if team:
            safe_api(f"/tekma/{mid}/ekipa/{team}/igralci?vrstaEkipe={kind}")
    if deep:
        safe_api(f"/pregledAkcijTekma/{mid}/tekma?nacinprikaza=1")
        safe_fetch(f"/natisniStatistikaTekme/{mid}/tekme?&vrstTiskanja=1")


def fetched(db, mid, part, error):
    """Record whether an optional part of a match could be fetched; failed parts are retried next run."""
    check(db, mid, f"fetch_{part}", error is None, error or "")


def load_match(db, m, sid, lid, deep, full_detail):
    mid = m["id"]
    det, err = safe_api(f"/pregledTekme/{mid}")
    fetched(db, mid, "detail", err)
    det = (det or {}).get("items") or {}
    score = [m.get("goli_domaci_konec"), m.get("goli_gosti_konec")]
    db.execute("INSERT OR REPLACE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        mid, sid, lid, det.get("krog"), m.get("datumCler"), m.get("cas"), m.get("status"),
        det.get("id_domaci"), det.get("id_gosti"), det.get("id_kluba_domaci"), det.get("id_kluba_gosti"),
        m.get("domaca_ekipa"), m.get("gostujoca_ekipa"), score[0], score[1],
        det.get("goli_domaci_polcas"), det.get("goli_gosti_polcas"), m.get("dvorana"), det.get("gledalci") or None,
        det.get("prvisoednik"), det.get("drugiSodnik"), det.get("domaci_trener"), det.get("gostujoci_trener"),
        "full" if full_detail else "scorers"))

    team_goals = []
    for side, team, kind in (("home", det.get("id_domaci"), 1), ("away", det.get("id_gosti"), 2)):
        d, err = safe_api(f"/tekma/{mid}/ekipa/{team}/igralci?vrstaEkipe={kind}") if team else (None, "no team id")
        fetched(db, mid, f"players_{side}", err)
        d = d or {}
        total = 0
        for p in d.get("lestvicaArray") or []:
            # Older seasons copy goals into the shot fields: store them as unknown, not as 100% shooting.
            shots, shots_7m = (p.get("steviloStrelov"), p.get("poskusi_7m")) if full_detail else (None, None)
            db.execute("INSERT OR REPLACE INTO player_match VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                mid, team, side, p.get("idIgralca"), p.get("ime"), p.get("priimek"), p.get("stevilkaIgralec"),
                (p.get("igralnoMesto") or "").strip(), p.get("vratar"), p.get("zadetkov"), shots,
                p.get("zadetki_7m"), shots_7m, p.get("rumeni_karton"), p.get("rdeci_kartoni"),
                p.get("izkljucitve"), json.dumps(p, ensure_ascii=False)))
            total += p.get("zadetkov") or 0
        for g in d.get("lestvicaArrayVratar") or []:
            name = f"{g.get('ime', '')} {g.get('priimek', '')}".strip()
            db.execute("INSERT OR REPLACE INTO goalkeeper_match VALUES (?,?,?,?,?,?)",
                       (mid, team, side, g.get("idIgralca"), name, json.dumps(g, ensure_ascii=False)))
        team_goals.append(total)
    if det:
        check(db, mid, "player_goals_eq_score", team_goals == score, f"{team_goals} vs {score}")

    if not deep:
        return
    pbp, err = safe_api(f"/pregledAkcijTekma/{mid}/tekma?nacinprikaza=1")
    fetched(db, mid, "pbp", err)
    pbp = pbp or []
    for i, e in enumerate(pbp):
        t = e.get("cas_tekme") or 0
        db.execute("INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
            mid, i, e.get("minuta"), t, {1: "home", 2: "away"}.get(e.get("ekipa")), e.get("naziv_akcije"),
            e.get("id"), e.get("vrednost_akcije"), e.get("sodelujoci"), e.get("domaci_gol"), e.get("gosti_gol")))
    if pbp:
        last = [max(e.get("domaci_gol") or 0 for e in pbp), max(e.get("gosti_gol") or 0 for e in pbp)]
        check(db, mid, "pbp_final_eq_score", last == score, f"{last} vs {score}")

    (ctype, body), err = safe_fetch(f"/natisniStatistikaTekme/{mid}/tekme?&vrstTiskanja=1")
    fetched(db, mid, "pdf", err)
    if err or "pdf" not in (ctype or ""):
        check(db, mid, "pdf", False, err or "no pdf")
        return
    try:
        import parse_zones
        path = os.path.join(DATA, f"tmp_{os.getpid()}.pdf")
        with open(path, "wb") as f:
            f.write(body)
        z = parse_zones.parse(path)
    except Exception as ex:
        check(db, mid, "pdf", False, f"{type(ex).__name__}: {ex}")
        return
    check(db, mid, "pdf_score_eq_score", z["score"] == score, f"{z['score']} vs {score}")
    for i, side in enumerate(("home", "away")):
        zg = 0
        for zone, v in z[side + "_zones"].items():
            db.execute("INSERT OR REPLACE INTO team_zones VALUES (?,?,?,?,?)", (mid, side, zone, v["goals"], v["shots"]))
            zg += v["goals"]
        mi, sv = z[side + "_misses_around_goal"], z[side + "_7m"]
        db.execute("INSERT OR REPLACE INTO team_shooting VALUES (?,?,?,?,?,?,?,?)",
                   (mid, side, sv["goals"], sv["shots"], mi["over"], mi["left"], mi["right"], zg))
        check(db, mid, f"zones_plus_7m_eq_score_{side}", zg + sv["goals"] == score[i], f"{zg}+{sv['goals']} vs {score[i]}")


def migrate(db):
    """Columns added after the first release; CREATE TABLE IF NOT EXISTS doesn't add them to old files."""
    cols = {r[1] for r in db.execute("PRAGMA table_info(matches)")}
    if "detail" not in cols:
        db.execute("ALTER TABLE matches ADD COLUMN detail TEXT")
        db.execute("UPDATE matches SET detail = 'full'")  # everything crawled before this was 2024/25+


def needs_load(db, mid):
    """New match, or one whose detail / players / play-by-play / PDF failed last time (RZS 500)."""
    if not db.execute("SELECT 1 FROM matches WHERE id=? AND status=1", (mid,)).fetchone():
        return True
    return bool(db.execute("SELECT 1 FROM checks WHERE match_id=? AND name LIKE 'fetch_%' AND ok=0", (mid,)).fetchone())


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "current"
    os.makedirs(CACHE, exist_ok=True)
    if arg == "--list-seasons":  # for crawler-loop.sh: every season id, newest first
        print(" ".join(str(s["id"]) for s in api("/seasons", fresh=True)))
        return
    shard, shards = map(int, (sys.argv[2] if len(sys.argv) > 2 else "0/1").split("/"))  # e.g. 1/3: every 3rd league
    db = sqlite3.connect(os.path.join(DATA, "stats.db"), timeout=120)
    db.execute("PRAGMA journal_mode = WAL")  # the app reads while the crawler writes
    db.executescript(SCHEMA)
    migrate(db)
    all_seasons = api("/seasons", fresh=True)  # newest first
    db.executemany("INSERT OR REPLACE INTO crawl_seasons VALUES (?,?,?)",
                   [(s["id"], s["ime"], i) for i, s in enumerate(all_seasons)])
    season = all_seasons[0] if arg == "current" else next(s for s in all_seasons if s["id"] == int(arg))
    sid = season["id"]
    full_detail = season_year(season) >= FULL_DETAIL_FROM
    db.execute("INSERT OR REPLACE INTO seasons VALUES (?,?)", (sid, season["ime"]))
    leagues = (api(f"/leaguesNew/{sid}", fresh=True) or {}).get("seznamLig") or []
    mine = [lg for n, lg in enumerate(leagues, 1) if n % shards == shard]
    progress = {"new": 0, "errors": 0, "done": 0}
    started = time.strftime("%Y-%m-%dT%H:%M:%S")

    def report(state, league=""):
        # One row per crawler process, shown on /stats/crawl.
        db.execute("INSERT OR REPLACE INTO crawl_progress VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            f"{shard}/{shards}", sid, season["ime"], f"{shard}/{shards}", progress["done"], len(mine), league,
            progress["new"], progress["errors"], state, started, time.strftime("%Y-%m-%dT%H:%M:%S")))
        db.commit()

    report("running")
    for lg in mine:
        lid, name = lg["id"], lg["ime"]
        report("running", name)
        cat = category(name)
        deep = full_detail and cat != "youth" and bool(ZONE_COMPETITIONS.search(name))
        db.execute("INSERT OR REPLACE INTO competitions VALUES (?,?,?,?)", (lid, sid, name, cat))
        krogi = (api(f"/pregledKrogiLiga/{sid}/sezona/{lid}", fresh=True) or {}).get("krogi") or []
        loaded = 0
        for k in krogi:
            if not k.get("odigrano"):
                continue
            tekme = (api(f"/tekmeLige/{lid}/sezona/{sid}", {"krog": k["krog"]}, fresh=True) or {}).get("tekme") or []
            for m in tekme:
                if m.get("status") != 1 or m.get("goli_domaci_konec") is None:  # 1 = played; 0 = scheduled (0:0)
                    continue
                if not needs_load(db, m["id"]):
                    continue
                try:
                    prefetch(m["id"], deep)
                    load_match(db, m, sid, lid, deep, full_detail)
                    loaded += 1
                    progress["new"] += 1
                except Exception as ex:
                    check(db, m["id"], "load", False, f"{type(ex).__name__}: {ex}")
                    progress["errors"] += 1
                db.commit()
                if loaded % 10 == 0:
                    report("running", name)
        progress["done"] += 1
        print(f"[{progress['done']}/{len(mine)}] {name}: {loaded} new matches{' (deep)' if deep else ''}", flush=True)
    report("done")


if __name__ == "__main__":
    main()
