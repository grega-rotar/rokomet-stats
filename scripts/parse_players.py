"""Parse the per-player tables from RZS match stats PDFs (natisniStatistikaTekme).

Usage: python3 scripts/parse_players.py file.pdf [...]   (pip install pypdf)
PDF from GET https://infostat.rokometna-zveza.si/api/public/natisniStatistikaTekme/{matchId}/tekme?&vrstTiskanja=1
See specs/data-source.md and specs/player-insights.md.

Page 1 / 3 = home / away: field-player table ("Vsi zadetki/streli") and goalkeeper table ("Vse obrambe/streli").
Page 2 / 4 = home / away: "Ostale akcije" table (fouls drawn, 7m drawn, 2min, 7m caused, ...) below the diagrams.
Empty cells are not in the text layer at all, so every number is put in a column by its x position,
matched to the nearest column label of the header row on the same page (the layout shifts between pages).

Long names wrap onto a second line ("... (Krožni" / "napadalec)"); the parser joins them.
Cells are {"goals", "shots"} (goalkeepers: {"saves", "shots"}) or plain integers; a missing key means an empty cell (0).

The PDF is a separate record from the JSON/play-by-play. Checked on Liga NLB 2026/27 rounds 1-8 (47 matches):
team goals = score in 93/94, player goals = JSON in 96% of rows, 7m/2min/cards/position 100%, but shot counts
("Streli", "Mimo") and goalkeeper saves often differ. Use it for shot TYPE (7m/6m/wing/9m) and attack type;
take goals, attempts and saves from the JSON. Youth PDFs carry only 7m. Details: specs/player-insights.md.
"""
import json
import re
import sys

import pypdf

FRAC = re.compile(r"^(\d+)/(\d+)$")
NAME = re.compile(r"^(.*?)\s*\((.*?)\s*\)$")

# header label -> output key, per table
FIELD_COLS = {"Goli": "goals", "Streli": "shots", "%": "pct", "7m": "7m", "6m": "6m", "Krilo": "wing", "9m": "9m",
              "Mimo": "misses", "Pos.": "set_attack", "Pol": "half_counter", "Hiter": "fast_break", "Ni": "no_attack_type",
              "RUM": "yellow", "RDE": "red", "2min": "2min"}
GK_COLS = {"Obrambe": "saves", "Streli": "shots", "%": "pct", "7m": "7m", "6m": "6m", "Krilo": "wing", "9m": "9m",
           "Ni podat.": "no_type"}
OTHER_COLS = {"Prekršek +": "fouls_drawn", "Podaja +": "assists", "Blok +": "blocks", "Žoga +": "steals",
              "7 +": "7m_drawn", "2min +": "2min_listed", "Žoga -": "turnovers", "Blok -": "shots_blocked",
              "7m -": "7m_caused", "Koraki -": "steps"}


def page_items(page):
    out = []

    def visit(text, cm, tm, _fd, _fs):
        t = text.strip().replace("\xa0", " ")
        if t:
            out.append((tm[4] * cm[0] + cm[4], tm[5] * cm[3] + cm[5], t))

    page.extract_text(visitor_text=visit)
    return out


def centre(x, t):
    return x + len(t) * 2.5  # ~5pt per glyph


def value(t, made="goals"):
    m = FRAC.match(t)
    if m:
        return {made: int(m[1]), "shots": int(m[2])}
    if t.isdigit():
        return int(t)
    raise ValueError(f"unexpected cell {t!r}")


def read_table(items, header_y, cols, stop_y, made="goals"):
    """Rows between header_y and stop_y (inclusive of the 'Skupaj' row at stop_y)."""
    heads = [(centre(x, t), cols[t]) for x, y, t in items if t in cols and abs(y - header_y) < 16]
    rows = {}
    for x, y, t in items:
        if stop_y - 2 <= y < header_y - 5:
            rows.setdefault(round(y), []).append((x, t))
    players, total = [], None
    for y in sorted(rows, reverse=True):
        cells = sorted(rows[y])
        label = [t for x, t in cells if x < 180]
        if not label:
            continue  # second header line ("obr.", "PN", "pod.")
        row = {}
        for x, t in cells:
            if x >= 180:
                key = min(heads, key=lambda h: abs(h[0] - centre(x, t)))[1]
                row[key] = value(t, made)
        if label[-1] == "Skupaj":
            total = row
            break
        if len(label) == 1 and players and not row:  # long name wrapped: "... (Krožni" + "napadalec)"
            full = f"{players[-1]['name']} ({players[-1]['position'] or ''} {label[0]}"
            m = NAME.match(full.replace("( ", "("))
            if m:
                players[-1].update(name=m[1], position=m[2])
            continue
        if len(label) == 2 and label[0].isdigit():
            m = NAME.match(label[1])
            name, _, pos = label[1].partition(" (")
            players.append({"number": int(label[0]), "name": m[1] if m else name,
                            "position": m[2] if m else pos or None, **row})
    return players, total


def team_page(items):
    hy = max(y for x, y, t in items if t == "Goli")
    gy = max(y for x, y, t in items if t == "Obrambe")  # "Obrambe" also heads the attack-type table further down
    totals_y = [y for x, y, t in items if t == "Skupaj" and x < 150]  # row labels, not the "Skupaj" column group
    field, field_total = read_table(items, hy, FIELD_COLS, max(y for y in totals_y if y < hy))
    gk, gk_total = read_table(items, gy, GK_COLS, max(y for y in totals_y if y < gy), "saves")
    gk = [g for g in gk if g.get("position") == "Vratar"]
    return field, field_total, gk, gk_total


def other_actions(items):
    hy = next(y for x, y, t in items if t == "Prekršek +")
    stop = max(y for x, y, t in items if t == "Skupaj" and x < 150 and y < hy)
    return read_table(items, hy, OTHER_COLS, stop)


def parse(path):
    reader = pypdf.PdfReader(path)
    meta = reader.pages[0].extract_text()
    score = re.search(r"Rezultat Konec (\d+):(\d+)", meta)
    teams = re.search(r"Ekipa A (.+)\nEkipa B (.+)\n", meta)
    result = {"home": teams[1].strip(), "away": teams[2].strip(), "score": [int(score[1]), int(score[2])]}
    for side, p_team, p_other in (("home", 0, 1), ("away", 2, 3)):
        field, field_total, gk, gk_total = team_page(page_items(reader.pages[p_team]))
        other, other_total = other_actions(page_items(reader.pages[p_other]))
        by_no = {o["number"]: o for o in other}
        for p in field:
            o = by_no.get(p["number"], {})
            p["other"] = {k: v for k, v in o.items() if k not in ("number", "name", "position")}
        result[side] = {"players": field, "totals": field_total, "goalkeepers": gk, "goalkeeper_totals": gk_total,
                        "other_totals": other_total}
    return result


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps({"file": p, **parse(p)}, ensure_ascii=False))
