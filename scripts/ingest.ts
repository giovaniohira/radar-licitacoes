// npx tsx scripts/ingest.ts                 -> yesterday and today (Brasília)
// npx tsx scripts/ingest.ts 2026-10-01      -> one day
// npx tsx scripts/ingest.ts 2026-10-01 2026-10-07 [--modalidades=6,8]
import { closePool, pool } from "../src/lib/db";
import { dias, hojeBR, ingestDia } from "../src/lib/ingest";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mods = process.argv.find((a) => a.startsWith("--modalidades="))?.split("=")[1];
const from = args[0] ?? hojeBR(-1);
const to = args[1] ?? (args[0] ? args[0] : hojeBR(0));

async function main() {
  const started = Date.now();
  for (const dia of dias(from, to)) {
    const r = await ingestDia(pool(), dia, {
      modalidades: mods ? mods.split(",").map(Number) : undefined,
      log: (m) => console.log(m),
    });
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
