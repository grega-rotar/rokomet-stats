import "server-only";
import { all, one } from "./db";

// Queries for /stats/data: coverage, checks, reviews, audits, crawl runs (specs/stats-pipeline.md).
// reviews / audits come from scripts/review.py and crawl_runs from scripts/crawl.py; on an older stats.db
// those tables may not exist yet, so every query here checks first.

function hasTable(name: string): boolean {
  return !!one<{ n: number }>("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = ?", name);
}

export type Coverage = {
  season_id: number; season: string; competition_id: number; competition: string; category: string;
  matches: number; with_pbp: number; with_zones: number; failed: number;
};

export function coverage(): Coverage[] {
  return all<Coverage>(
    `SELECT m.season_id, s.name AS season, c.id AS competition_id, c.name AS competition, c.category,
            count(*) AS matches,
            sum(EXISTS (SELECT 1 FROM events e WHERE e.match_id = m.id)) AS with_pbp,
            sum(EXISTS (SELECT 1 FROM team_shooting t WHERE t.match_id = m.id AND t.zone_goals > 0)) AS with_zones,
            sum(EXISTS (SELECT 1 FROM checks k WHERE k.match_id = m.id AND k.ok = 0)) AS failed
     FROM matches m
     JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
     JOIN seasons s ON s.id = m.season_id
     WHERE m.status = 1
     GROUP BY m.season_id, c.id
     ORDER BY m.season_id DESC, CASE c.category WHEN 'top' THEN 0 WHEN 'senior' THEN 1 ELSE 2 END, matches DESC, c.name`,
  );
}

export type CheckRate = { name: string; total: number; passed: number; explained: number };

export function checkRates(): CheckRate[] {
  const explained = hasTable("reviews")
    ? "(SELECT count(*) FROM reviews r JOIN checks k ON k.match_id = r.match_id AND k.name = r.check_name WHERE k.ok = 0 AND k.name = c.name AND r.kind IS NOT 'unexplained')"
    : "0";
  return all<CheckRate>(
    `SELECT c.name, count(*) AS total, sum(c.ok) AS passed, ${explained} AS explained
     FROM checks c GROUP BY c.name ORDER BY CASE c.name WHEN 'load' THEN 0 ELSE 1 END, c.name`,
  );
}

export type Failure = {
  match_id: number; check_name: string; detail: string;
  reason: string | null; source: "rule" | "ai" | null; kind: string | null; model: string | null; reviewed_at: string | null;
  date: string | null; home: string | null; away: string | null; home_goals: number | null; away_goals: number | null;
  competition: string | null;
};

/** Every failed check with its review (if any): AI reviews and unreviewed ones first, then newest match first. */
export function failures(): Failure[] {
  const review = hasTable("reviews")
    ? "r.reason, r.source, r.kind, r.model, r.created_at AS reviewed_at"
    : "NULL AS reason, NULL AS source, NULL AS kind, NULL AS model, NULL AS reviewed_at";
  const join = hasTable("reviews") ? "LEFT JOIN reviews r ON r.match_id = k.match_id AND r.check_name = k.name" : "";
  return all<Failure>(
    `SELECT k.match_id, k.name AS check_name, k.detail, ${review},
            m.date, m.home, m.away, m.home_goals, m.away_goals, c.name AS competition
     FROM checks k ${join}
     LEFT JOIN matches m ON m.id = k.match_id
     LEFT JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
     WHERE k.ok = 0
     ORDER BY CASE ${hasTable("reviews") ? "coalesce(r.source, 'none')" : "'none'"} WHEN 'ai' THEN 0 WHEN 'none' THEN 1 ELSE 2 END,
              substr(m.date,7,4)||substr(m.date,4,2)||substr(m.date,1,2) DESC, k.match_id DESC, k.name`,
  );
}

export type AuditMatch = {
  match_id: number; date: string; home: string; away: string; home_goals: number; away_goals: number;
  fields: number; agree: number; at: string;
};
export type AuditMiss = { match_id: number; field: string; db_value: number | null; ai_value: number | null };

/** The latest audit run: matches audited within a day of the newest audit row. */
export function latestAudit(): { matches: AuditMatch[]; misses: AuditMiss[]; total: { fields: number; agree: number; matches: number } } {
  const empty = { matches: [], misses: [], total: { fields: 0, agree: 0, matches: 0 } };
  if (!hasTable("audits")) return empty;
  const since = `(SELECT datetime(substr(max(created_at), 1, 19), '-1 day') FROM audits)`;
  const matches = all<AuditMatch>(
    `SELECT a.match_id, m.date, m.home, m.away, m.home_goals, m.away_goals,
            count(*) AS fields, sum(a.ok) AS agree, max(a.created_at) AS at
     FROM audits a JOIN matches m ON m.id = a.match_id
     WHERE datetime(substr(a.created_at, 1, 19)) >= ${since}
     GROUP BY a.match_id ORDER BY agree * 1.0 / count(*), at DESC`,
  );
  const misses = all<AuditMiss>(
    `SELECT match_id, field, db_value, ai_value FROM audits
     WHERE ok = 0 AND datetime(substr(created_at, 1, 19)) >= ${since} ORDER BY match_id, field`,
  );
  const total = one<{ fields: number; agree: number; matches: number }>(
    "SELECT count(*) AS fields, coalesce(sum(ok), 0) AS agree, count(DISTINCT match_id) AS matches FROM audits",
  ) ?? empty.total;
  return { matches, misses, total };
}

export type CrawlRun = { started_at: string; finished_at: string; season: string | null; matches_new: number; errors: number };

/** Recent crawler processes (one row per shard), newest first. */
export function crawlRuns(limit = 9): CrawlRun[] {
  if (!hasTable("crawl_runs")) return [];
  return all<CrawlRun>(
    `SELECT r.started_at, r.finished_at, s.name AS season, r.matches_new, r.errors
     FROM crawl_runs r LEFT JOIN seasons s ON s.id = r.season_id
     ORDER BY r.finished_at DESC LIMIT ?`,
    limit,
  );
}
