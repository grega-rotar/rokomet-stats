"""Run one read-only SQL query on stats.db and print the rows as a Markdown table.

Usage: python3 scripts/query.py "SELECT ..."   (STATS_DB_PATH, default data/stats.db)
For chat Claude: the database is opened read-only, so a write fails instead of changing data.
"""
import os
import sqlite3
import sys

DB = os.environ.get("STATS_DB_PATH") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "stats.db")
MAX_ROWS = 200

if len(sys.argv) != 2:
    sys.exit(__doc__)
db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
cur = db.execute(sys.argv[1])
cols = [d[0] for d in cur.description or []]
rows = cur.fetchmany(MAX_ROWS + 1)
print("| " + " | ".join(cols) + " |")
print("|" + "---|" * len(cols))
for r in rows[:MAX_ROWS]:
    print("| " + " | ".join("" if v is None else str(v).replace("|", "/") for v in r) + " |")
if len(rows) > MAX_ROWS:
    print(f"\n(first {MAX_ROWS} rows only; add LIMIT or aggregate)")
