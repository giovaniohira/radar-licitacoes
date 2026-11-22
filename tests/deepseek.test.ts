import { describe, expect, it, vi } from "vitest";
import { DEEPSEEK_URL, extrairTexto, resumirTexto } from "@/lib/deepseek";
import { ResumoError, provedor, resumoConfigurado, type Resumo } from "@/lib/summary-tipos";

const RESUMO: Resumo = {
  objeto: "Aquisição de notebooks.",
  valor_estimado: "R$ 100.000,00",
  prazos: [{ evento: "Sessão pública", data: "30/11/2026 09:00" }],
  exigencias_habilitacao: ["Certidão negativa federal"],
  exclusivo_me_epp: true,
  garantia: "não exige",
  criterio_julgamento: "menor preço",
  local_entrega_execucao: "Curitiba/PR",
  pontos_de_atencao: ["Amostra em 3 dias"],
};

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const boa = (over: Record<string, unknown> = {}) =>
  resposta({
    model: "DeepSeek-V4.1-Flash-1017",
    choices: [{ message: { content: JSON.stringify(RESUMO) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 40000, completion_tokens: 1200 },
    ...over,
  });

/** A one-page PDF with the given text (Helvetica), with a valid xref table. */
function pdfComTexto(texto: string): Buffer {
  const linhas = texto.match(/.{1,80}/g) ?? [""];
  const conteudo = `BT /F1 10 Tf 12 14 TL 20 780 Td ${linhas.map((l) => `(${l.replace(/[()\\]/g, " ")}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("resumirTexto (DeepSeek)", () => {
  it("sends the text with JSON output and thinking off, and returns the validated summary and the tokens", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(boa());
    const out = await resumirTexto("TEXTO DO EDITAL", { fetchImpl, apiKey: "chave-de-teste" });
    expect(out).toEqual({ resumo: RESUMO, modelo: "DeepSeek-V4.1-Flash-1017", uso: { entrada: 40000, saida: 1200 } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(DEEPSEEK_URL);
    expect(init.headers.authorization).toBe("Bearer chave-de-teste");
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({ model: "deepseek-flash", response_format: { type: "json_object" }, thinking: { type: "disabled" } });
    expect(corpo.messages[0].content).toContain("json"); // the API requires the word json in the prompt
    expect(corpo.messages[0].content).toContain("pontos_de_atencao"); // and the schema
    expect(corpo.messages[1].content).toContain("TEXTO DO EDITAL");
  });

  it("turns every failure into a ResumoError the page can show", async () => {
    const opcoes = { apiKey: "k" };
    const falha = (fetchImpl: typeof fetch) => resumirTexto("x", { ...opcoes, fetchImpl });
    await expect(falha(vi.fn().mockResolvedValue(resposta({}, 500)))).rejects.toThrow(/indisponível/);
    await expect(falha(vi.fn().mockResolvedValue(boa({ choices: [{ message: { content: "   " }, finish_reason: "stop" }] })))).rejects.toThrow(/incompleto/);
    await expect(falha(vi.fn().mockResolvedValue(boa({ choices: [{ message: { content: JSON.stringify(RESUMO) }, finish_reason: "length" }] })))).rejects.toThrow(/incompleto/);
    await expect(falha(vi.fn().mockResolvedValue(boa({ choices: [{ message: { content: "não é json" }, finish_reason: "stop" }] })))).rejects.toThrow(/incompleto/);
    await expect(falha(vi.fn().mockResolvedValue(boa({ choices: [{ message: { content: JSON.stringify({ objeto: "só isso" }) }, finish_reason: "stop" }] })))).rejects.toBeInstanceOf(ResumoError);
    await expect(resumirTexto("x", { fetchImpl: vi.fn(), apiKey: "" })).rejects.toThrow(/não configurado/);
  });
});

describe("extrairTexto", () => {
  it("reads the text of a PDF", async () => {
    const frase = "O objeto desta licitacao e a aquisicao de notebooks para a secretaria de educacao. ";
    const texto = await extrairTexto(pdfComTexto(frase.repeat(8)));
    expect(texto).toContain("aquisicao de notebooks");
  });

  it("refuses a PDF without text, such as a scan", async () => {
    await expect(extrairTexto(pdfComTexto("pouco"))).rejects.toThrow(/digitalizado/);
  });
});

describe("provedor", () => {
  it("defaults to Anthropic and switches to DeepSeek with its own key check", () => {
    const antes = { ...process.env };
    delete process.env.RESUMO_PROVEDOR;
    process.env.ANTHROPIC_API_KEY = "a";
    delete process.env.DEEPSEEK_API_KEY;
    expect(provedor()).toBe("anthropic");
    expect(resumoConfigurado()).toBe(true);
    process.env.RESUMO_PROVEDOR = "deepseek";
    expect(provedor()).toBe("deepseek");
    expect(resumoConfigurado()).toBe(false); // the Anthropic key does not count for DeepSeek
    process.env.DEEPSEEK_API_KEY = "d";
    expect(resumoConfigurado()).toBe(true);
    process.env = antes;
  });
});
