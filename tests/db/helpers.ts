import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

export function readSql(...parts: string[]) {
  return readFileSync(join(root, ...parts), "utf8");
}

/** Fresh in-memory Postgres with Supabase stubs, all migrations, and (optionally) the seed. */
export async function freshDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(readSql("tests", "db", "supabase-stubs.sql"));
  for (const f of migrationFiles) {
    await db.exec(readSql("supabase", "migrations", f));
  }
  if (seed) await db.exec(readSql("supabase", "seed.sql"));
  return db;
}
