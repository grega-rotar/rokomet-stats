import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

// One connection per process, kept on globalThis so dev hot reloads don't open more.
const g = globalThis as unknown as { __db?: Db };

function open(): Db {
  const file = process.env.DATABASE_PATH ?? "./data/app.db";
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export function getDb(): Db {
  return (g.__db ??= open());
}

// The `drizzle/` folder must sit next to the server (copy it into the Docker image).
export function runMigrations() {
  migrate(getDb(), { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
}

export { schema };
