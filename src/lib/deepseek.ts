import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { ResumoError, ResumoSchema, type Resumo, type UsoDeTokens } from "./summary-tipos";

/**
 * AI summaries with DeepSeek, an alternative to the Anthropic provider (RESUMO_PROVEDOR=deepseek). DeepSeek takes text
 * only, so the edital PDF is turned into text first; a scanned PDF (images only) cannot be summarized this way.
 */
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const MODELO_DEEPSEEK = () => process.env.RESUMO_MODEL_DEEPSEEK ?? "deepseek-flash";

/** About 120k tokens: a long edital fits whole, and a runaway document cannot make one summary expensive. */
const MAX_CARACTERES = 400_000;
const MIN_CARACTERES = 300;

const SYSTEM = `Você lê editais de licitação brasileiros (Lei 14.133/2021) e resume para o dono de uma pequena empresa decidir se vale participar.
Extraia apenas o que está no documento. Quando algo não estiver no edital, diga "não informado" em vez de supor.
Escreva em português claro, sem juridiquês, com datas no formato dd/mm/aaaa hh:mm.
Responda somente com um objeto json que siga exatamente este json schema, sem texto fora do json:`;

export async function extrairTexto(pdf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  const limpo = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (limpo.length < MIN_CARACTERES) {
    throw new ResumoError("O edital é um PDF digitalizado (sem texto); abra direto no PNCP.");
  }
  return limpo.slice(0, MAX_CARACTERES);
}

interface RespostaDeepSeek {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
}

export async function resumirTexto(
  texto: string,
  { fetchImpl = fetch, apiKey = process.env.DEEPSEEK_API_KEY, modelo = MODELO_DEEPSEEK() }: { fetchImpl?: typeof fetch; apiKey?: string; modelo?: string } = {},
): Promise<{ resumo: Resumo; modelo: string; uso: UsoDeTokens }> {
  if (!apiKey) throw new ResumoError("Resumo por IA não configurado neste servidor.");
  const res = await fetchImpl(DEEPSEEK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: `${SYSTEM}\n${JSON.stringify(z.toJSONSchema(ResumoSchema))}` },
        { role: "user", content: `Resuma este edital.\n\n${texto}` },
      ],
      response_format: { type: "json_object" },
      // Thinking off: the summary is extraction, and the reasoning tokens would be billed as output for no gain.
      thinking: { type: "disabled" },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new ResumoError(`O serviço de resumo está indisponível agora (HTTP ${res.status}); tente mais tarde.`);
  const corpo = (await res.json()) as RespostaDeepSeek;
  const escolha = corpo.choices?.[0];
  const conteudo = escolha?.message?.content?.trim();
  if (!conteudo || escolha?.finish_reason === "length") throw new ResumoError("O resumo veio incompleto; tente de novo.");
  let json: unknown;
  try {
    json = JSON.parse(conteudo);
  } catch {
    throw new ResumoError("O resumo veio incompleto; tente de novo.");
  }
  const validado = ResumoSchema.safeParse(json);
  if (!validado.success) throw new ResumoError("O resumo veio incompleto; tente de novo.");
  return {
    resumo: validado.data,
    modelo: corpo.model ?? modelo,
    uso: { entrada: corpo.usage?.prompt_tokens ?? 0, saida: corpo.usage?.completion_tokens ?? 0 },
  };
}
