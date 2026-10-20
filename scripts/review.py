"""Explain failed checks and audit a sample of matches against the PDF picture (specs/stats-pipeline.md).

Usage: python3 scripts/review.py [all|triage|ai|audit] [--dry-run] [--force-audit] [--match ID]
  triage  rules only (no AI): a known reason for every failed check code can explain -> `reviews` (source 'rule')
  ai      for failed checks no rule explains and that have a cached stats PDF: render the page, ask Claude for a
          one-line reason -> `reviews` (source 'ai'). At most REVIEW_MAX_RUNS (20) runs per call.
  audit   once a week (marker STATS_DATA_DIR/audit.last): AUDIT_SAMPLE (10) random matches with zones; Claude reads
          the goal grids and team totals from the picture, code compares them with team_zones / team_shooting
          -> `audits`.
  all     triage, then ai, then audit (the crawler runs this after each crawl).
--dry-run renders the pictures and prints the prompts, but calls no Claude and writes no AI rows.

Code extracts, AI explains: this script only writes the `reviews` and `audits` tables. Claude's text goes in
`reviews.reason`; what it read off the picture goes in `audits.ai_value`, next to the number code stored.
Nothing here changes matches, player_match, team_zones, team_shooting or checks.

Env: STATS_DATA_DIR (stats.db + cache), CLAUDE_BIN (claude-pool; falls back to claude), REVIEW_MODEL (sonnet),
REVIEW_MAX_RUNS (20), REVIEW_TIMEOUT_SECONDS (180), AUDIT_SAMPLE (10), AUDIT_EVERY_DAYS (7).
Needs PyMuPDF (Debian: python3-fitz) for the pictures; triage works without it.
"""
import gzip
import hashlib
import json
import os
import random
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("STATS_DATA_DIR") or os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
MAX_RUNS = int(os.environ.get("REVIEW_MAX_RUNS") or 20)
TIMEOUT = int(os.environ.get("REVIEW_TIMEOUT_SECONDS") or 180)
MODEL = os.environ.get("REVIEW_MODEL", "sonnet")
AUDIT_SAMPLE = int(os.environ.get("AUDIT_SAMPLE") or 10)
AUDIT_EVERY = float(os.environ.get("AUDIT_EVERY_DAYS") or 7) * 86400
ZONES = [f"{r}_{c}" for r in ("top", "mid", "bottom") for c in ("left", "center", "right")]
SIDES = ("home", "away")
GOAL_TYPES = ("Strel na gol", "7M")  # play-by-play events of the scoring team; value 1 = goal

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (match_id INTEGER, check_name TEXT, reason TEXT, detail TEXT,
    source TEXT, model TEXT, created_at TEXT, PRIMARY KEY (match_id, check_name));
CREATE TABLE IF NOT EXISTS audits (match_id INTEGER, field TEXT, db_value INTEGER, ai_value INTEGER, ok INTEGER,
    created_at TEXT, PRIMARY KEY (match_id, field));
"""


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def cached(path):
    """(content_type, body) from the crawler's cache (same key as crawl.fetch), or None. Never fetches."""
    fn = os.path.join(CACHE, hashlib.sha1((path + json.dumps(None)).encode()).hexdigest() + ".gz")
    if not os.path.exists(fn):
        return None
    with gzip.open(fn, "rb") as f:
        ctype, _, body = f.read().partition(b"\n")
    return ctype.decode(), body


def pdf_bytes(mid):
    hit = cached(f"/natisniStatistikaTekme/{mid}/tekme?&vrstTiskanja=1")
    return hit[1] if hit and "pdf" in hit[0] else None


# ---------------------------------------------------------------- triage (rules, no AI)

def nums(s):
    return [int(x) for x in re.findall(r"-?\d+", s or "")]


def team_names(db, mid):
    r = db.execute("SELECT home, away FROM matches WHERE id=?", (mid,)).fetchone()
    return dict(zip(SIDES, r)) if r else {"home": "home", "away": "away"}


def explain_load(detail):
    if "HTTP Error 5" in detail:
        code = re.search(r"HTTP Error (\d+)", detail)[1]
        return f"RZS server error (HTTP {code}); the crawler retries the match on its next run"
    if re.search(r"HTTPError|URLError|timed out|TimeoutError|ConnectionReset|RemoteDisconnected", detail):
        return f"RZS request failed ({detail[:80]}); the crawler retries the match on its next run"
    return None


def explain_player_goals(db, mid, detail):
    v = nums(detail)
    if len(v) != 4:
        return None
    players, score = v[:2], v[2:]
    names = team_names(db, mid)
    parts = []
    for i, side in enumerate(SIDES):
        gap = score[i] - players[i]
        if gap == 0:
            continue
        rows = db.execute("SELECT count(*) FROM player_match WHERE match_id=? AND side=?", (mid, side)).fetchone()[0]
        if rows == 0:
            forfeit = " (registered result, e.g. a forfeit)" if score[i] == 10 and score[1 - i] == 0 else ""
            parts.append(f"{names[side]}: no player rows at all{forfeit}")
            continue
        pbp = dict(db.execute(
            f"SELECT player, count(*) FROM events WHERE match_id=? AND side=? AND value=1 AND type IN ({','.join('?' * len(GOAL_TYPES))}) GROUP BY player",
            (mid, side, *GOAL_TYPES)).fetchall())
        if pbp and sum(pbp.values()) == score[i] and gap > 0:
            table = {f"{a} {b}".strip(): g or 0 for a, b, g in db.execute(
                "SELECT first_name, last_name, goals FROM player_match WHERE match_id=? AND side=?", (mid, side))}
            keepers = {n for (n,) in db.execute("SELECT name FROM goalkeeper_match WHERE match_id=? AND side=?", (mid, side))}
            found, bits = 0, []
            for name, g in sorted(pbp.items(), key=lambda kv: str(kv[0])):
                short = g - table.get(name, 0)
                if short <= 0 or not name:
                    continue
                found += short
                if name in keepers:
                    bits.append(f"goalkeeper {name} scored {short} (goalkeeper rows carry no goals)")
                elif name not in table:
                    bits.append(f"{name} scored {short} in the play-by-play but is missing from the player table")
                else:
                    bits.append(f"{name} has {short} more in the play-by-play than in the player table")
            if found == gap:
                parts.append(f"{names[side]}: " + "; ".join(bits))
                continue
        if 0 < gap <= 3 and not pbp:
            parts.append(f"{names[side]}: {gap} goal{'s' if gap > 1 else ''} not credited to any player "
                         f"(players sum to {players[i]}, score {score[i]})")
            continue
        return None  # one side no rule fits: leave the whole check for the AI review
    return "; ".join(parts) or None


def zone_coverage(db):
    """competition_id -> (team sides with any zone goal, team sides with a zone check)."""
    out = {}
    for comp, with_zones, total in db.execute(
            """SELECT m.competition_id, sum(s.zone_goals > 0), count(*) FROM team_shooting s
               JOIN matches m ON m.id = s.match_id GROUP BY m.competition_id"""):
        out[comp] = (with_zones or 0, total)
    return out


def explain_zones(db, mid, side, detail, coverage):
    v = nums(detail)
    if len(v) != 3:
        return None
    zg, sevens, score = v
    gap = score - zg - sevens
    if zg == 0:
        comp = db.execute("SELECT competition_id FROM matches WHERE id=?", (mid,)).fetchone()
        with_zones, total = coverage.get(comp[0] if comp else None, (0, 0))
        if total and with_zones / total < 0.5:
            return f"competition without goal zones (only {with_zones} of {total} team sheets have any)"
        return "no goal zones entered for this team (only the 7m)"
    if zg == score and sevens > 0:
        return f"the zone grid already holds all {score} goals, the {sevens} 7m goals included"
    if 0 < gap <= 3:
        return f"goals without zone: {gap}"
    if gap > 3:
        return f"partial zones: {zg} of {score - sevens} field goals have a zone"
    return None  # more goals than the score: the AI looks at the picture


def explain(db, mid, name, detail, coverage):
    if name == "load":
        return explain_load(detail)
    if name == "player_goals_eq_score":
        return explain_player_goals(db, mid, detail)
    if name.startswith("zones_plus_7m_eq_score_"):
        return explain_zones(db, mid, name.rsplit("_", 1)[1], detail, coverage)
    if name == "pdf" and detail == "no pdf":
        return "RZS has no stats PDF for this match"
    return None


def put_review(db, mid, check, reason, detail, source, model=None):
    db.execute("INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?,?)",
               (mid, check, reason, detail, source, model, now()))


def triage(db):
    """Rule reasons for every failed check; drop reviews whose check passed since or changed. Returns counts."""
    db.execute("""DELETE FROM reviews WHERE NOT EXISTS (SELECT 1 FROM checks c WHERE c.match_id = reviews.match_id
                  AND c.name = reviews.check_name AND c.ok = 0 AND c.detail IS reviews.detail)""")
    coverage = zone_coverage(db)
    counts = Counter()
    for mid, name, detail in db.execute("SELECT match_id, name, detail FROM checks WHERE ok = 0").fetchall():
        reason = explain(db, mid, name, detail, coverage)
        if reason:
            put_review(db, mid, name, reason, detail, "rule")
            counts[rule_key(name, reason)] += 1
            continue
        old = db.execute("SELECT source FROM reviews WHERE match_id=? AND check_name=?", (mid, name)).fetchone()
        if old and old[0] == "ai":
            counts["(ai review kept)"] += 1
        elif pdf_bytes(mid) is None:
            put_review(db, mid, name, "no rule fits and there is no stats PDF to look at", detail, "rule")
            counts["no rule, no PDF"] += 1
        else:
            db.execute("DELETE FROM reviews WHERE match_id=? AND check_name=?", (mid, name))
            counts["(waiting for AI review)"] += 1
    db.commit()
    return counts


def rule_key(name, reason):
    """Group label for the triage summary: the reason without its numbers and names."""
    if name == "player_goals_eq_score":
        for k in ("no player rows", "goalkeeper", "missing from the player table", "more in the play-by-play",
                  "not credited to any player"):
            if k in reason:
                return f"player goals: {k}"
    return re.sub(r"\b\d+\b", "n", reason.split(" (")[0]) if name.startswith("zones") else reason.split(";")[0][:60]


# ---------------------------------------------------------------- pictures

def fitz():
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf  # Debian bookworm's python3-fitz (PyMuPDF 1.21)
    return pymupdf


def first_hit(page, text, below=0.0, max_x=1e9):
    hits = [r for r in page.search_for(text) if r.y0 > below and r.x0 < max_x]
    return min(hits, key=lambda r: r.y0) if hits else None


def grid_clip(doc, side):
    """Left half of page 2 (home) / 4 (away): '<TEAM> V NAPADU', the 3x3 goal grid, misses and the court."""
    page = doc[1 if side == "home" else 3]
    seven = first_hit(page, "7m", max_x=300)
    bottom = seven.y1 + 30 if seven else 300
    return page.number, fitz().Rect(0, 0, page.rect.width / 2, bottom)


def table_clip(doc, side, totals_only=False):
    """The field-player table of page 1 (home) / 3 (away): team name, header and the 'Skupaj' totals row."""
    page = doc[0 if side == "home" else 2]
    goli = first_hit(page, "Goli")
    if not goli:
        return [(page.number, page.rect)]
    total = first_hit(page, "Skupaj", below=goli.y1, max_x=300)
    end = total.y1 + 6 if total else page.rect.height
    if totals_only and total:
        return [(page.number, fitz().Rect(0, goli.y0 - 48, page.rect.width, goli.y1 + 22)),
                (page.number, fitz().Rect(0, total.y0 - 6, page.rect.width, end))]
    return [(page.number, fitz().Rect(0, goli.y0 - 48, page.rect.width, end))]


def compose(doc, parts, out, dpi=150):
    """Stack page clips on one new page and save it as a PNG: one picture per question."""
    f = fitz()
    width = max(clip.width for _, clip in parts)
    height = sum(clip.height for _, clip in parts) + 12 * (len(parts) - 1)
    new = f.open()
    page = new.new_page(width=width, height=height)
    y = 0
    for pno, clip in parts:
        page.show_pdf_page(f.Rect(0, y, clip.width, y + clip.height), doc, pno, clip=clip)
        y += clip.height + 12
    page.get_pixmap(dpi=dpi).save(out)
    new.close()


# ---------------------------------------------------------------- Claude

def claude_bin():
    want = os.environ.get("CLAUDE_BIN") or "claude-pool"
    return shutil.which(want) or shutil.which("claude")


def ask(prompt, image_dir, image_name):
    """One claude -p run in image_dir that may only Read image_name. Returns (text, model) or raises."""
    args = [claude_bin(), "-p", "--output-format", "json", "--no-session-persistence", "--strict-mcp-config",
            "--max-turns", "4", "--tools", "Read", "--allowedTools", f"Read(./{image_name})",
            "--permission-mode", "dontAsk"]
    if MODEL:
        args += ["--model", MODEL]
    env = {**os.environ, "CLAUDE_POOL_FRESH": "0"}  # pick an account on saved usage, like the app does
    r = subprocess.run(args, input=prompt, cwd=image_dir, capture_output=True, text=True, timeout=TIMEOUT, env=env)
    try:
        out = json.loads(r.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"exit {r.returncode}: {(r.stderr or r.stdout)[-300:]}")
    if out.get("is_error") or r.returncode:
        raise RuntimeError(f"claude error: {str(out.get('result'))[:300]}")
    model = next(iter(out.get("modelUsage") or {}), MODEL)
    return str(out.get("result") or "").strip(), model


CHECK_MEANING = {
    "player_goals_eq_score": "the players' goals in RZS's JSON player stats should add up to the final score "
                             "(detail: JSON player sums [home, away] vs final score)",
    "pbp_final_eq_score": "the last score in the play-by-play should equal the final score",
    "pdf_score_eq_score": "the final score printed on the stats PDF should equal the final score",
}


def review_prompt(db, mid, name, detail, side):
    m = db.execute("SELECT home, away, home_goals, away_goals FROM matches WHERE id=?", (mid,)).fetchone()
    lines = [
        f"Match {mid}: {m[0]} vs {m[1]}, final score {m[2]}:{m[3]} (Slovenian handball, RZS stats sheet).",
        f"A data check failed. Check `{name}`, detail `{detail}`.",
    ]
    if side:
        names = dict(zip(SIDES, m[:2]))
        grid = dict((z, (g, s)) for z, g, s in db.execute(
            "SELECT zone, goals, shots FROM team_zones WHERE match_id=? AND side=?", (mid, side)))
        cells = ", ".join(f"{z} {grid[z][0]}/{grid[z][1]}" for z in ZONES if z in grid)
        lines += [
            f"The check: for {names[side]}, the goals in the 3x3 goal-zone grid plus the 7m goals should equal "
            f"their score. Detail format: zone goals + 7m goals vs score.",
            f"Our parser read this grid (goals/shots on target, shooter's view): {cells}.",
            "The picture shows the team's 'V NAPADU' half (goal grid, red numbers = misses, court with 7m label), "
            "then the team's player table with the 'Skupaj' totals row (7m column = 7m goals/attempts).",
        ]
    else:
        lines += [f"The check: {CHECK_MEANING.get(name, name)}."]
        if name == "player_goals_eq_score":
            v = nums(detail)
            for i, side in enumerate(SIDES):
                if len(v) == 4 and v[i] != v[2 + i]:
                    rows = db.execute("""SELECT number, first_name || ' ' || last_name, goals FROM player_match
                                         WHERE match_id=? AND side=? AND goals > 0 ORDER BY goals DESC""", (mid, side))
                    lines.append(f"{m[i]} in RZS's JSON player stats (a separate record from this PDF), "
                                 "#number name goals: " + ", ".join(f"#{n} {p} {g}" for n, p, g in rows))
        lines.append("The picture shows the player tables of the PDF stats sheet with their 'Skupaj' totals rows; "
                     "compare them with the JSON numbers above.")
    lines += [
        "Read ./review.png (the only file you may open) and say in ONE line, at most 200 characters, the most likely "
        "reason the numbers don't add up (for example: a parser misread, goals entered without a zone, 7m goals "
        "also put in the grid, a goal not credited to a player). Only state numbers you can see in the picture. "
        "If you can't tell, say so. Reply with that one line only.",
    ]
    return "\n".join(lines)


def ai_review(db, dry=False, only=None, max_runs=MAX_RUNS):
    todo = db.execute(
        """SELECT c.match_id, c.name, c.detail FROM checks c
           LEFT JOIN reviews r ON r.match_id = c.match_id AND r.check_name = c.name
           WHERE c.ok = 0 AND r.match_id IS NULL ORDER BY c.match_id DESC""").fetchall()
    if only:
        todo = [t for t in todo if t[0] == only]
    if not todo:
        print("ai review: nothing to review")
        return
    if not dry and not claude_bin():
        print("ai review: no claude binary (CLAUDE_BIN), skipped")
        return
    runs = 0
    for mid, name, detail in todo:
        if runs >= max_runs:
            print(f"ai review: stopped at REVIEW_MAX_RUNS={max_runs}, {len(todo) - runs} left for next time")
            break
        body = pdf_bytes(mid)
        if body is None:
            continue
        side = name.rsplit("_", 1)[1] if name.startswith("zones_plus_7m_eq_score_") else None
        tmp = tempfile.mkdtemp(prefix="review-", dir=DATA)
        try:
            doc = fitz().open(stream=body, filetype="pdf")
            if side:
                parts = [grid_clip(doc, side), *table_clip(doc, side, totals_only=True)]
            else:
                parts = [*table_clip(doc, "home"), *table_clip(doc, "away")]
            compose(doc, parts, os.path.join(tmp, "review.png"))
            prompt = review_prompt(db, mid, name, detail, side)
            if dry:
                print(f"--- dry run {mid} {name}: {tmp}/review.png\n{prompt}\n")
                runs += 1
                continue
            runs += 1
            text, model = ask(prompt, tmp, "review.png")
            reason = (text.splitlines() or [""])[0].strip()[:300]
            if reason:
                put_review(db, mid, name, reason, detail, "ai", model)
                db.commit()
            print(f"ai review {mid} {name}: {reason}")
        except Exception as ex:
            print(f"ai review {mid} {name} failed: {type(ex).__name__}: {ex}")
        finally:
            if not dry:
                shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- weekly audit

AUDIT_PROMPT = """This picture is cut from the RZS stats sheet of a Slovenian handball match: {home} (home) vs {away} (away).
From top to bottom: the home team's 'V NAPADU' half (its shots: a 3x3 goal grid of goals/shots on target), the away
team's 'V NAPADU' half, then each team's player-table header and its 'Skupaj' totals row.

Read ./audit.png (the only file you may open) and reply with JSON only, no prose:
{{"home": {{"zones": {{"top_left": [goals, shots], "top_center": [..], "top_right": [..], "mid_left": [..], "mid_center": [..],
 "mid_right": [..], "bottom_left": [..], "bottom_center": [..], "bottom_right": [..]}}, "goals": n, "sevens": [goals, attempts]}},
 "away": {{...same...}}}}
Grid rows/columns as drawn (top row = under the crossbar, left = left in the picture). An empty cell is [0, 0].
"goals" = the Goli total in the Skupaj row, "sevens" = the 7m total there. Use null for a number you can't read."""


def audit_fields(db, mid):
    """field -> value code stored, for the numbers the audit asks Claude to read."""
    out = {}
    m = db.execute("SELECT home_goals, away_goals FROM matches WHERE id=?", (mid,)).fetchone()
    for i, side in enumerate(SIDES):
        for z, g, s in db.execute("SELECT zone, goals, shots FROM team_zones WHERE match_id=? AND side=?", (mid, side)):
            out[f"{side}.{z}.goals"], out[f"{side}.{z}.shots"] = g, s
        sh = db.execute("SELECT goals_7m, shots_7m FROM team_shooting WHERE match_id=? AND side=?", (mid, side)).fetchone()
        if sh:
            out[f"{side}.7m.goals"], out[f"{side}.7m.shots"] = sh
        out[f"{side}.goals"] = m[i]
    return out


def ai_fields(data):
    out = {}
    for side in SIDES:
        t = (data or {}).get(side) or {}
        for z in ZONES:
            g, s = ((t.get("zones") or {}).get(z) or [None, None])[:2]
            out[f"{side}.{z}.goals"], out[f"{side}.{z}.shots"] = g, s
        sv = (t.get("sevens") or [None, None])[:2]
        out[f"{side}.7m.goals"], out[f"{side}.7m.shots"] = sv
        out[f"{side}.goals"] = t.get("goals")
    return out


def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m[0]) if m else None


def audit(db, dry=False, force=False, only=None, sample=AUDIT_SAMPLE):
    marker = os.path.join(DATA, "audit.last")
    if not (force or only) and os.path.exists(marker) and time.time() - os.path.getmtime(marker) < AUDIT_EVERY:
        print("audit: ran less than a week ago, skipped")
        return
    if not dry and not claude_bin():
        print("audit: no claude binary (CLAUDE_BIN), skipped")
        return
    ids = [only] if only else [r[0] for r in db.execute(
        """SELECT DISTINCT s.match_id FROM team_shooting s WHERE s.zone_goals > 0
           AND s.match_id NOT IN (SELECT match_id FROM audits)""")]
    random.shuffle(ids)
    done = 0
    for mid in ids:
        if done >= sample:
            break
        body = pdf_bytes(mid)
        if body is None:
            continue
        done += 1
        home, away = team_names(db, mid).values()
        tmp = tempfile.mkdtemp(prefix="audit-", dir=DATA)
        try:
            doc = fitz().open(stream=body, filetype="pdf")
            parts = [grid_clip(doc, "home"), grid_clip(doc, "away"),
                     *table_clip(doc, "home", totals_only=True), *table_clip(doc, "away", totals_only=True)]
            compose(doc, parts, os.path.join(tmp, "audit.png"))
            prompt = AUDIT_PROMPT.format(home=home, away=away)
            if dry:
                print(f"--- dry run audit {mid}: {tmp}/audit.png\n{prompt}\n")
                continue
            text, model = ask(prompt, tmp, "audit.png")
            have, read = audit_fields(db, mid), ai_fields(parse_json(text))
            ts = now()
            db.execute("DELETE FROM audits WHERE match_id=?", (mid,))
            for field, v in have.items():
                got = read.get(field)
                got = got if isinstance(got, int) else None
                db.execute("INSERT INTO audits VALUES (?,?,?,?,?,?)", (mid, field, v, got, int(got == v), ts))
            db.commit()
            bad = [f"{f}: db {v} vs ai {read.get(f)}" for f, v in have.items() if read.get(f) != v]
            print(f"audit {mid} ({model}): {len(have) - len(bad)}/{len(have)} agree" + (f"; {'; '.join(bad)}" if bad else ""))
        except Exception as ex:
            print(f"audit {mid} failed: {type(ex).__name__}: {ex}")
        finally:
            if not dry:
                shutil.rmtree(tmp, ignore_errors=True)
    if done and not dry and not only:
        with open(marker, "w") as f:
            f.write(now() + "\n")


def main():
    args = sys.argv[1:]
    step = next((a for a in args if a in ("all", "triage", "ai", "audit")), "all")
    dry = "--dry-run" in args or os.environ.get("REVIEW_DRY_RUN") == "1"
    only = int(args[args.index("--match") + 1]) if "--match" in args else None
    db = sqlite3.connect(os.path.join(DATA, "stats.db"), timeout=120)
    db.executescript(SCHEMA)
    if step in ("all", "triage"):
        counts = triage(db)
        print(f"triage: {sum(counts.values())} failed checks")
        for k, n in counts.most_common():
            print(f"  {n:4d}  {k}")
    if step in ("all", "ai"):
        ai_review(db, dry, only)
    if step in ("all", "audit"):
        audit(db, dry, "--force-audit" in args, only)


if __name__ == "__main__":
    main()
