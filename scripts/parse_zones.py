"""Parse goal-zone grids from RZS match stats PDFs (natisniStatistikaTekme).

Usage: python3 scripts/parse_zones.py file.pdf [...]   (pip install pypdf)
PDF from GET https://infostat.rokometna-zveza.si/api/public/natisniStatistikaTekme/{matchId}/tekme?&vrstTiskanja=1
See specs/data-source.md.
Page 2 = home team, page 4 = away team; left half of each page is "V NAPADU" (their shots).
"""
import json
import re
import sys

import pypdf

FRAC = re.compile(r"^(\d+)/(\d+)$")
ROWS = ("top", "mid", "bottom")
COLS = ("left", "center", "right")


def page_items(page):
    out = []

    def visit(text, cm, tm, _fd, _fs):
        if text.strip():
            out.append((tm[4] * cm[0] + cm[4], tm[5] * cm[3] + cm[5], text.strip()))

    page.extract_text(visitor_text=visit)
    return out


def goal_grid(items):
    """3x3 goal grid of the attack half (x < 300), located relative to the court's "7m" label.

    The whole diagram shifts between pages (home/away, wrapped team names), so positions are
    taken as text centres relative to the 7m label: grid rows sit ~94/66/37pt above it, columns
    ~-40/-4/+38pt beside it. Plain integers around the grid are shots that missed the goal.
    """
    sx, sy = next((x + 5, y) for x, y, t in items if t == "7m" and x < 300)
    grid = {f"{r}_{c}": {"goals": 0, "shots": 0} for r in ROWS for c in COLS}
    misses = {"over": 0, "left": 0, "right": 0}
    for x, y, t in items:
        dx, dy = x + len(t) * 2.5 - sx, y - sy  # ~5pt per glyph at 9pt
        if x >= 300 or not 25 < dy < 140:
            continue
        m = FRAC.match(t)
        if m and -60 < dx < 60 and dy < 108:
            row = ROWS[0 if dy > 80 else 1 if dy > 51 else 2]
            col = COLS[0 if dx < -21 else 1 if dx < 17 else 2]
            grid[f"{row}_{col}"] = {"goals": int(m[1]), "shots": int(m[2])}
        elif t.isdigit():
            misses["over" if dy > 108 else "left" if dx < 0 else "right"] += int(t)
        else:
            raise ValueError(f"unexpected text near goal: {t!r} at dx={dx:.0f} dy={dy:.0f}")
    return grid, misses


def parse(path):
    reader = pypdf.PdfReader(path)
    meta = reader.pages[0].extract_text()
    score = re.search(r"Rezultat Konec (\d+):(\d+)", meta)
    teams = re.search(r"Ekipa A (.+)\nEkipa B (.+)\n", meta)
    result = {"home": teams[1].strip(), "away": teams[2].strip(), "score": [int(score[1]), int(score[2])]}
    for side, page_no, team_page in (("home", 1, 0), ("away", 3, 2)):
        grid, misses = goal_grid(page_items(reader.pages[page_no]))
        # first "Skupaj" row on the team page = field players' totals: goals shots % 7m_goals/7m_shots ...
        sevens = re.search(r"Skupaj \d+ \d+ \d+ (\d+)/(\d+)", reader.pages[team_page].extract_text())
        result[side + "_7m"] = {"goals": int(sevens[1]), "shots": int(sevens[2])}
        result[side + "_zones"] = grid
        result[side + "_misses_around_goal"] = misses
    return result


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps({"file": p, **parse(p)}, ensure_ascii=False))
