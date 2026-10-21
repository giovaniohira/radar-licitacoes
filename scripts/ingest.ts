// npx tsx scripts/ingest.ts                 -> editais from yesterday and today (Brasília)
// npx tsx scripts/ingest.ts 2026-10-01      -> one day
// npx tsx scripts/ingest.ts 2026-10-01 2026-10-07 [--modalidades=6,8]
// npx tsx scripts/ingest.ts 2026-07-01 2026-10-20 --contratos [--force]
//   -> signed contracts instead; days already finished are skipped unless --force, so a backfill can resume.
import { closePool, pool } from "../src/lib/db";
import { dias, hojeBR, ingestContratosDia, ingestDia } from "../src/lib/ingest";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (f: string) => process.argv.includes(f);
const mods = process.argv.find((a) => a.startsWith("--modalidades="))?.split("=")[1];
const from = args[0] ?? hojeBR(-1);
const to = args[1] ?? (args[0] ? args[0] : hojeBR(0));

async function main() {
  const started = Date.now();
  const db = pool();
  const feitos = flag("--contratos") && !flag("--force")
    ? new Set((await db.query<{ dia: string }>(`select dia::text from contratos_runs`)).rows.map((r) => r.dia))
    : new Set<string>();
  for (const dia of dias(from, to)) {
    if (feitos.has(dia) && dia < hojeBR(-1)) continue;
    const r = flag("--contratos")
      ? await ingestContratosDia(db, dia, { log: (m) => console.log(m) })
      : await ingestDia(db, dia, { modalidades: mods ? mods.split(",").map(Number) : undefined, log: (m) => console.log(m) });
    console.log(`${dia}: ${r.registros} lidos, ${r.inseridos} novos, ${r.atualizados} atualizados`);
  }
  console.log(`ok em ${Math.round((Date.now() - started) / 1000)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
