import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Pool } from "pg";
import { fetchArquivos, pickEdital, type EditalRow } from "./pncp";

export const ResumoSchema = z.object({
  objeto: z.string().describe("O que está sendo contratado, em 1-2 frases simples."),
  valor_estimado: z.string().describe("Valor estimado total ou por lote, como aparece no edital; 'não informado' se ausente."),
  prazos: z
    .array(z.object({ evento: z.string(), data: z.string() }))
    .describe("Datas relevantes: abertura, limite de propostas, impugnação, esclarecimentos, sessão pública."),
  exigencias_habilitacao: z.array(z.string()).describe("Documentos e requisitos de habilitação (jurídica, fiscal, técnica, econômica)."),
  exclusivo_me_epp: z.boolean().describe("Se há participação exclusiva ou cota reservada para ME/EPP."),
  garantia: z.string().describe("Garantia de proposta ou contratual exigida; 'não exige' se não houver."),
  criterio_julgamento: z.string(),
  local_entrega_execucao: z.string(),
  pontos_de_atencao: z.array(z.string()).describe("Riscos e armadilhas para uma pequena empresa: amostras, visita técnica, atestados, multas, prazos curtos."),
});

export type Resumo = z.infer<typeof ResumoSchema>;

export const LIMITE_DIARIO = Number(process.env.RESUMO_LIMITE_DIARIO ?? 10);
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const SYSTEM = `Você lê editais de licitação brasileiros (Lei 14.133/2021) e resume para o dono de uma pequena empresa decidir se vale participar.
Extraia apenas o que está no documento. Quando algo não estiver no edital, diga "não informado" em vez de supor.
Escreva em português claro, sem juridiquês, com datas no formato dd/mm/aaaa hh:mm.`;

export class ResumoError extends Error {}

export async function downloadPdf(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ResumoError(`Não foi possível baixar o edital (HTTP ${res.status}).`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES) throw new ResumoError("O edital tem mais de 25 MB; abra direto no PNCP.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PDF_BYTES) throw new ResumoError("O edital tem mais de 25 MB; abra direto no PNCP.");
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ResumoError("O documento principal não é um PDF (pode ser ZIP ou DOC); abra direto no PNCP.");
  }
  return buf;
}

export async function summarizePdf(pdf: Buffer, client = new Anthropic()): Promise<{ resumo: Resumo; modelo: string }> {
  const response = await client.beta.messages.parse({
    model: process.env.RESUMO_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ResumoSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: "Resuma este edital." },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ResumoError("O modelo não conseguiu resumir este documento.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ResumoError("O resumo veio incompleto; tente de novo.");
  }
  return { resumo: response.parsed_output, modelo: response.model };
}

/**
 * Returns the cached summary or builds one. Counts against the user's daily quota only when Claude is called.
 */
export async function getOrCreateResumo(db: Pool, edital: EditalRow, userId: number) {
  const cached = await db.query<{ dados: Resumo; documento: string }>(`select dados, documento from resumos where edital_id = $1`, [edital.id]);
  if (cached.rows[0]) return cached.rows[0];

  const uso = await db.query<{ total: number }>(
    `insert into resumo_uso (user_id) values ($1)
     on conflict (user_id, dia) do update set total = resumo_uso.total + 1
     returning total`,
    [userId],
  );
  if (uso.rows[0].total > LIMITE_DIARIO) {
    await db.query(`update resumo_uso set total = total - 1 where user_id = $1 and dia = current_date`, [userId]);
    throw new ResumoError(`Limite de ${LIMITE_DIARIO} resumos por dia atingido.`);
  }
  try {
    const arquivo = pickEdital(await fetchArquivos(edital));
    if (!arquivo) throw new ResumoError("Este edital não tem documentos publicados no PNCP.");
    const { resumo, modelo } = await summarizePdf(await downloadPdf(arquivo.url));
    await db.query(
      `insert into resumos (edital_id, documento, dados, modelo) values ($1, $2, $3, $4) on conflict (edital_id) do nothing`,
      [edital.id, arquivo.url, JSON.stringify(resumo), modelo],
    );
    return { dados: resumo, documento: arquivo.url };
  } catch (err) {
    await db.query(`update resumo_uso set total = total - 1 where user_id = $1 and dia = current_date`, [userId]);
    if (err instanceof ResumoError) throw err;
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API", err.status, err.message);
      throw new ResumoError("O serviço de resumo está indisponível agora; tente mais tarde.");
    }
    throw err;
  }
}
