"""Survey the RZS API: count matches per season/league, then spot-check a sample of matches.

Usage: python3 scripts/survey.py OUT_DIR   (pip install pypdf)
Writes OUT_DIR/leagues.jsonl (one line per season+league) and OUT_DIR/matches.jsonl (one line per
sampled match, with the checks). API responses are cached in OUT_DIR/cache, so a rerun is cheap.
See specs/data-source.md.
"""
import gzip
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import parse_zones  # noqa: E402

B = "https://infostat.rokometna-zveza.si/api/public"
OUT = sys.argv[1]
CACHE = os.path.join(OUT, "cache")
DELAY = 0.8
YOUTH = re.compile(r"\b[mž]\d{2}\b|mlad|kadet|deč|dekl|starejš|mlajš|\bu\d{2}\b", re.I)
SAMPLE = {"top": 2, "senior": 2, "youth": 2}  # sampled leagues per category per season


def fetch(path, form=None):
    """(content_type, body) with an on-disk cache keyed by path + form."""
    key = hashlib.sha1((path + json.dumps(form, sort_keys=True)).encode()).hexdigest()
    fn = os.path.join(CACHE, key + ".gz")
    if os.path.exists(fn):
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


def api(path, form=None):
    ctype, body = fetch(path, form)
    if "json" not in ctype:
        return None
    return json.loads(body).get("data")


def category(name):
    if YOUTH.search(name):
        return "youth"
    if ("Člani" in name or "Članice" in name) and re.search(r"NLB|1\. ?SRL|1\. ?A|1\. ?DRL|1\. ?MRL|1\. ?ŽRL", name, re.I):
        return "top"
    return "senior"


def check_match(m, sezona, liga):
    """Fetch everything we know about one match and cross-check it against the final score."""
    mid = m["id"]
    r = {"match": mid, "sezona": sezona, "liga": liga, "status": m.get("status"),
         "score": [m.get("goli_domaci_konec"), m.get("goli_gosti_konec")]}
    score = r["score"]

    det = (api(f"/pregledTekme/{mid}") or {}).get("items") or {}
    r["detail"] = bool(det)
    home_id, away_id = det.get("id_domaci"), det.get("id_gosti")

    pbp = api(f"/pregledAkcijTekma/{mid}/tekma?nacinprikaza=1") or []
    r["pbp_events"] = len(pbp)
    if pbp:
        last = [max(e.get("domaci_gol") or 0 for e in pbp), max(e.get("gosti_gol") or 0 for e in pbp)]
        r["pbp_final"] = last
        r["pbp_ok"] = last == score
        r["pbp_coords"] = sum(1 for e in pbp if e.get("koordinata_strela_end") not in (None, "0", 0))

    goals = []
    for team, kind in ((home_id, 1), (away_id, 2)):
        if not team:
            goals.append(None)
            continue
        d = api(f"/tekma/{mid}/ekipa/{team}/igralci?vrstaEkipe={kind}") or {}
        players = (d.get("lestvicaArray") or []) + (d.get("lestvicaArrayVratar") or [])
        goals.append(sum(p.get("zadetkov") or 0 for p in players) if players else None)
    r["players_goals"] = goals
    r["players_ok"] = goals == score

    ctype, body = fetch(f"/natisniStatistikaTekme/{mid}/tekme?&vrstTiskanja=1")
    r["pdf"] = "pdf" in ctype
    if r["pdf"]:
        path = os.path.join(OUT, "tmp.pdf")
        with open(path, "wb") as f:
            f.write(body)
        try:
            d = parse_zones.parse(path)
            r["pdf_score_ok"] = d["score"] == score
            zg = [sum(v["goals"] for v in d[s + "_zones"].values()) + d[s + "_7m"]["goals"] for s in ("home", "away")]
            r["zones_plus_7m"] = zg
            r["zone_coverage"] = round(sum(zg) / max(1, sum(score)), 2)
        except Exception as e:
            r["pdf_error"] = f"{type(e).__name__}: {str(e)[:100]}"
    return r


def main():
    os.makedirs(CACHE, exist_ok=True)
    rnd = random.Random(42)
    seasons = api("/seasons")
    with open(os.path.join(OUT, "leagues.jsonl"), "w") as lf, open(os.path.join(OUT, "matches.jsonl"), "w") as mf:
        for s in seasons:
            sid = s["id"]
            leagues = (api(f"/leaguesNew/{sid}") or {}).get("seznamLig") or []
            rows = []
            for lg in leagues:
                krogi = (api(f"/pregledKrogiLiga/{sid}/sezona/{lg['id']}") or {}).get("krogi") or []
                row = {"sezona": sid, "season": s["ime"], "liga": lg["id"], "name": lg["ime"],
                       "category": category(lg["ime"]), "rounds": len(krogi),
                       "played": sum(k.get("odigrano") or 0 for k in krogi),
                       "labels": sorted({re.sub(r"\d+", "N", k["krog"]) for k in krogi})}
                rows.append((row, krogi))
                lf.write(json.dumps(row, ensure_ascii=False) + "\n")
                lf.flush()
            print(s["ime"], len(leagues), "leagues", sum(r["played"] for r, _ in rows), "matches", flush=True)

            for cat, n in SAMPLE.items():
                pool = [(r, k) for r, k in rows if r["category"] == cat and r["played"]]
                for row, krogi in rnd.sample(pool, min(n, len(pool))):
                    k = rnd.choice([k for k in krogi if k.get("odigrano")])
                    tekme = (api(f"/tekmeLige/{row['liga']}/sezona/{sid}", {"krog": k["krog"]}) or {}).get("tekme") or []
                    played = [t for t in tekme if t.get("goli_domaci_konec") is not None]
                    if not played:
                        mf.write(json.dumps({"sezona": sid, "liga": row["liga"], "krog": k["krog"],
                                             "error": "round lists no played match", "statuses": [t.get("status") for t in tekme]}) + "\n")
                        continue
                    try:
                        res = check_match(rnd.choice(played), sid, row["liga"])
                    except Exception as e:
                        res = {"sezona": sid, "liga": row["liga"], "error": f"{type(e).__name__}: {str(e)[:100]}"}
                    res.update(season=s["ime"], category=cat, name=row["name"],
                               round_statuses=sorted({str(t.get("status")) for t in tekme}))
                    mf.write(json.dumps(res, ensure_ascii=False) + "\n")
                    mf.flush()


if __name__ == "__main__":
    main()
