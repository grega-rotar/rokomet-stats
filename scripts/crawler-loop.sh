#!/bin/sh
# The crawler container's command (infra/compose.yml, specs/stats-pipeline.md).
# Every CRAWL_INTERVAL_SECONDS: crawl the current season, then each season in CRAWL_HISTORY once
# (newest first; "all" = every season RZS lists, back to 2004/05).
# Each crawl runs CRAWL_SHARDS processes in parallel (each takes every Nth league).
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
