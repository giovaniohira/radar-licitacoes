// Measures what an AI summary costs, on real open editais of different sectors. Writes nothing to the database.
//
//   ANTHROPIC_API_KEY=... npx tsx --env-file=.env.local scripts/medir-custo-resumo.ts \
//     --modelos=claude-opus-5-5,claude-sonnet-5-5 --precos=claude-opus-5-5=5:25,claude-sonnet-5-5=3:15 [--n=20]
//
// --precos is "modelo=entrada:saida" in US$ per million tokens (check the current price list; it is not hard-coded here).
// For each edital it downloads the main PDF from the PNCP, summarizes it with every model and prints the tokens and
// the cost; the last lines are the averages per model.
import Anthropic from "@anthropic-ai/sdk";
import { closePool, pool } from "../src/lib/db";
import { fetchArquivos, pickEdital, type EditalRow } from "../src/lib/pncp";
import { SETORES } from "../src/lib/setores";
import { buildSearch } from "../src/lib/search";
import { downloadPdf, provedor, summarizePdf } from "../src/lib/summary";

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");
const N = Number(arg("n") ?? 20);
const MOSTRAR = Number(arg("mostrar") ?? 0);
let mostrados = 0;
const modelos = (arg("modelos") ?? (provedor() === "deepseek" ? "deepseek-flash" : "claude-opus-5-5")).split(",");
const precos = new Map(
  (arg("precos") ?? "").split(",").filter(Boolean).map((p) => {
    const [m, v] = p.split("=");
    const [i, o] = v.split(":").map(Number);
    return [m, { entrada: i, saida: o }] as const;
  }),
);

async function amostra(): Promise<{ edital: EditalRow; setor: string; pdf: Buffer }[]> {
  const db = pool();
  const out: { edital: EditalRow; setor: string; pdf: Buffer }[] = [];
  const porSetor = Math.ceil(N / SETORES.length);
  const usados = new Set<string>();
  for (const setor of SETORES) {
    const { sql, params } = buildSearch({ palavras: setor.palavras, abertas: true, ordem: "prazo" }, { limit: 60 });
    const candidatos = (await db.query<{ id: string }>(sql, params)).rows.filter((r) => !usados.has(r.id));
    let doSetor = 0;
    for (const c of candidatos.sort(() => Math.random() - 0.5)) {
      if (doSetor >= porSetor || out.length >= N) break;
      const edital = (await db.query<EditalRow>(`select * from editais where id = $1`, [c.id])).rows[0];
      try {
        const arquivo = pickEdital(await fetchArquivos(edital));
        if (!arquivo) continue;
        const pdf = await downloadPdf(arquivo.url);
        out.push({ edital, setor: setor.id, pdf });
        usados.add(c.id);
        doSetor++;
      } catch {
        // No PDF, a ZIP or too large: the real job skips these too.
      }
    }
  }
  return out.slice(0, N);
}

async function main() {
  const itens = await amostra();
  console.log(`${itens.length} editais, ${modelos.length} modelo(s)`);
  // DeepSeek reads the PDF's text and needs no client; Anthropic reads the PDF itself.
  const client = provedor() === "deepseek" ? undefined : new Anthropic();
  const soma = new Map<string, { n: number; entrada: number; saida: number; usd: number; seg: number }>();
  for (const { edital, setor, pdf } of itens) {
    for (const modelo of modelos) {
      process.env.RESUMO_MODEL = modelo;
      process.env.RESUMO_MODEL_DEEPSEEK = modelo;
      const t = Date.now();
      try {
        const { resumo, uso } = await summarizePdf(pdf, client);
        if (mostrados < MOSTRAR) {
          mostrados++;
          console.log(`--- ${edital.id}
EDITAL: ${edital.objeto.slice(0, 160)}
${JSON.stringify(resumo, null, 1)}
---`);
        }
        const seg = (Date.now() - t) / 1000;
        const p = precos.get(modelo);
        const usd = p ? (uso.entrada * p.entrada + uso.saida * p.saida) / 1e6 : NaN;
        const s = soma.get(modelo) ?? { n: 0, entrada: 0, saida: 0, usd: 0, seg: 0 };
        soma.set(modelo, { n: s.n + 1, entrada: s.entrada + uso.entrada, saida: s.saida + uso.saida, usd: s.usd + usd, seg: s.seg + seg });
        console.log(`${setor}\t${edital.id}\t${Math.round(pdf.length / 1024)}KB\t${modelo}\tin=${uso.entrada}\tout=${uso.saida}\t${seg.toFixed(0)}s\tUS$ ${usd.toFixed(4)}`);
      } catch (err) {
        console.log(`${setor}\t${edital.id}\t${modelo}\tFALHOU: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log("\nMédias por resumo:");
  for (const [m, s] of soma) {
    console.log(`${m}: ${s.n} resumos, entrada ${Math.round(s.entrada / s.n)}, saída ${Math.round(s.saida / s.n)}, ${(s.seg / s.n).toFixed(0)} s, US$ ${(s.usd / s.n).toFixed(4)} (total US$ ${s.usd.toFixed(2)})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
