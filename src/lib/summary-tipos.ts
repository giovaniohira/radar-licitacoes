import { z } from "zod";

// Shared by the Anthropic and DeepSeek providers (kept apart so neither imports the other).
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

export class ResumoError extends Error {}

export interface UsoDeTokens {
  entrada: number;
  saida: number;
}

/** Which AI provider writes the summaries: Anthropic (default, reads the PDF itself) or DeepSeek (reads the PDF's text). */
export const provedor = () => (process.env.RESUMO_PROVEDOR === "deepseek" ? "deepseek" : "anthropic");

/** True when the chosen provider has its key, so the feature can be offered. */
export const resumoConfigurado = () => (provedor() === "deepseek" ? !!process.env.DEEPSEEK_API_KEY : !!process.env.ANTHROPIC_API_KEY);
