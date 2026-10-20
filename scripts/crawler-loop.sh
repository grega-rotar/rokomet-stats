#!/bin/sh
# The crawler container's command (infra/compose.yml, specs/stats-pipeline.md).
# Every CRAWL_INTERVAL_SECONDS: crawl the current season, refresh club addresses (scripts/clubs.py),
# then each season in CRAWL_HISTORY once (newest first; "all" = every season RZS lists, back to 2004/05).
# Each crawl runs CRAWL_SHARDS processes in parallel (each takes every Nth league).
# Then scripts/review.py: rule reasons for failed checks, AI review for the rest (REVIEW_MAX_RUNS), weekly audit.
set -u
INTERVAL=${CRAWL_INTERVAL_SECONDS:-21600}
SHARDS=${CRAWL_SHARDS:-3}
HISTORY=${CRAWL_HISTORY:-all}
DATA=${STATS_DATA_DIR:-/data}

crawl() {
  i=0
  while [ "$i" -lt "$SHARDS" ]; do
    python3 /app/scripts/crawl.py "$1" "$i/$SHARDS" &
    i=$((i + 1))
  done
  wait
}

while true; do
  # Chat Claude runs in $WORK_DIR/<chat>; Claude Code reads CLAUDE.md from parent folders.
  mkdir -p "${WORK_DIR:-/data/work}" && cp /app/scripts/chat-CLAUDE.md "${WORK_DIR:-/data/work}/CLAUDE.md"
  echo "$(date -Is) crawl current season"
  crawl current
  # Once: fill the PDF tables added later (shot types) for matches crawled before them, from the cache.
  # After the current season so new results don't wait behind it; resumes where a restart cut it off.
  if [ ! -f "$DATA/reparse-shot-types.done" ]; then
    python3 /app/scripts/crawl.py --reparse && touch "$DATA/reparse-shot-types.done"
  fi
  python3 /app/scripts/clubs.py current || echo "$(date -Is) clubs.py failed"
  # Review right after the current season, so it doesn't wait for the (long) first history crawl.
  echo "$(date -Is) review failed checks"
  python3 /app/scripts/review.py all || echo "$(date -Is) review failed"
  seasons=$HISTORY
  # The current season is the first in the list and is crawled above on every run, never marked done.
  [ "$HISTORY" = all ] && seasons=$(python3 /app/scripts/crawl.py --list-seasons | cut -d' ' -f2-)
  for s in $seasons; do
    if [ ! -f "$DATA/crawl-$s.done" ]; then
      echo "$(date -Is) crawl season $s"
      crawl "$s" && touch "$DATA/crawl-$s.done"
    fi
  done
  echo "$(date -Is) done, next run in ${INTERVAL}s"
  sleep "$INTERVAL"
done
