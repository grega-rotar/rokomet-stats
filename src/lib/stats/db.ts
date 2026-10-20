import "server-only";
import fs from "node:fs";
import Database from "better-sqlite3";

// stats.db is written by the crawler (scripts/crawl.py, specs/stats-pipeline.md); the app only reads it.

const g = globalThis as unknown as { __statsDb?: Database.Database | null };

export function statsDb(): Database.Database | null {
  if (g.__statsDb) return g.__statsDb;
  const file = process.env.STATS_DB_PATH ?? "./data/stats.db";
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  g.__statsDb = db;
  return db;
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  const db = statsDb();
  return db ? (db.prepare(sql).all(...params) as T[]) : [];
}

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = statsDb();
  return db ? (db.prepare(sql).get(...params) as T | undefined) : undefined;
}
