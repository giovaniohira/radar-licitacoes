import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, pool } from "../src/lib/db";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

export async function migrate(): Promise<string[]> {
  const db = pool();
  await db.query("create table if not exists schema_migrations (nome text primary key, aplicado_em timestamptz default now())");
  const done = new Set((await db.query<{ nome: string }>("select nome from schema_migrations")).rows.map((r) => r.nome));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("insert into schema_migrations (nome) values ($1)", [file]);
      await client.query("commit");
      applied.push(file);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then((a) => console.log(a.length ? `aplicadas: ${a.join(", ")}` : "nada a aplicar"))
    .finally(closePool);
}
