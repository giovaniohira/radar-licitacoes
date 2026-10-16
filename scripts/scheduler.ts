// Long-running job runner for the `jobs` container: no cron daemon needed.
// Ingests at 06:00, 12:00 and 18:00 and sends digests at 07:00 (Brasília).
import { closePool, pool } from "../src/lib/db";
import { sendDigests } from "../src/lib/alerts";
import { hojeBR, ingestDia } from "../src/lib/ingest";

const INGEST_HOURS = [6, 12, 18];
const DIGEST_HOUR = 7;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

function brHour(now = new Date()) {
  return (now.getUTCHours() + 21) % 24;
}

let running = false;
let lastSlot = "";

async function tick() {
  const now = new Date();
  const hour = brHour(now);
  const slot = `${hojeBR(0, now)}T${hour}`;
  if (running || slot === lastSlot) return;
  const doIngest = INGEST_HOURS.includes(hour);
  const doDigest = hour === DIGEST_HOUR;
  if (!doIngest && !doDigest) return;
  running = true;
  lastSlot = slot;
  try {
    if (doIngest) {
      // Yesterday too: late publications and updates land after midnight.
      for (const dia of [hojeBR(-1, now), hojeBR(0, now)]) {
        const r = await ingestDia(pool(), dia);
        console.log(`[${now.toISOString()}] ingest ${dia}: ${r.registros} lidos, ${r.inseridos} novos, ${r.atualizados} atualizados`);
      }
    }
    if (doDigest) {
      const n = await sendDigests(pool(), appUrl, (m) => console.log(`  ${m}`));
      console.log(`[${now.toISOString()}] digests: ${n} e-mails`);
    }
  } catch (err) {
    console.error(`[${now.toISOString()}] job falhou`, err);
  } finally {
    running = false;
  }
}

console.log("scheduler iniciado");
void tick();
const timer = setInterval(tick, 60_000);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    clearInterval(timer);
    void closePool().then(() => process.exit(0));
  });
}
