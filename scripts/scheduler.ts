// Long-running job runner for the `jobs` container: no cron daemon needed. Hours are Brasília time.
// 06h/12h/18h ingest editais · 06h ingest contracts · 07h send digests.
import { closePool, pool } from "../src/lib/db";
import { sendDigests } from "../src/lib/alerts";
import { hojeBR, ingestContratosDia, ingestDia } from "../src/lib/ingest";

const INGEST_HOURS = [6, 12, 18];
const CONTRATOS_HOUR = 6;
const DIGEST_HOUR = 7;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

function brHour(now = new Date()) {
  return (now.getUTCHours() + 21) % 24;
}

let running = false;
let lastSlot = "";

async function step(nome: string, fn: () => Promise<string>) {
  try {
    console.log(`[${new Date().toISOString()}] ${nome}: ${await fn()}`);
  } catch (err) {
    // One failing job (PNCP down, SMTP down) must not skip the others in the same slot.
    console.error(`[${new Date().toISOString()}] ${nome} falhou`, err);
  }
}

async function tick() {
  const now = new Date();
  const hour = brHour(now);
  const slot = `${hojeBR(0, now)}T${hour}`;
  if (running || slot === lastSlot) return;
  running = true;
  lastSlot = slot;
  try {
    // Yesterday too: late publications and updates land after midnight.
    const diasAlvo = [hojeBR(-1, now), hojeBR(0, now)];
    if (INGEST_HOURS.includes(hour)) {
      for (const dia of diasAlvo) {
        await step(`editais ${dia}`, async () => {
          const r = await ingestDia(pool(), dia);
          return `${r.registros} lidos, ${r.inseridos} novos, ${r.atualizados} atualizados`;
        });
      }
    }
    if (hour === CONTRATOS_HOUR) {
      for (const dia of diasAlvo) {
        await step(`contratos ${dia}`, async () => {
          const r = await ingestContratosDia(pool(), dia);
          return `${r.registros} lidos, ${r.inseridos} novos`;
        });
      }
    }
    if (hour === DIGEST_HOUR) await step("digests", async () => `${await sendDigests(pool(), appUrl)} e-mails`);
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
