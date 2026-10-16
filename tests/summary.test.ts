import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { downloadPdf, ResumoError, summarizePdf, type Resumo } from "@/lib/summary";

const resumo: Resumo = {
  objeto: "Compra de notebooks",
  valor_estimado: "R$ 100.000,00",
  prazos: [{ evento: "Sessão pública", data: "29/10/2026 09:00" }],
  exigencias_habilitacao: ["CND federal"],
  exclusivo_me_epp: true,
  garantia: "não exige",
  criterio_julgamento: "Menor preço por item",
  local_entrega_execucao: "Sede da prefeitura",
  pontos_de_atencao: ["Amostra em 3 dias úteis"],
};

function fakeClient(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe("summarizePdf", () => {
  it("sends the PDF as a base64 document with structured output and fallbacks", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: resumo, model: "claude-opus-5-5" });
    const out = await summarizePdf(Buffer.from("%PDF-1.7 teste"), client);
    expect(out).toEqual({ resumo, modelo: "claude-opus-5-5" });

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.messages[0].content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1.7 teste").toString("base64") },
    });
  });

  it("surfaces refusals and truncation as user-facing errors", async () => {
    await expect(summarizePdf(Buffer.from("%PDF-"), fakeClient({ stop_reason: "refusal", parsed_output: null }).client)).rejects.toBeInstanceOf(ResumoError);
    await expect(summarizePdf(Buffer.from("%PDF-"), fakeClient({ stop_reason: "max_tokens", parsed_output: null }).client)).rejects.toThrow("incompleto");
  });
});

describe("downloadPdf", () => {
  it("accepts PDFs", async () => {
    const f = vi.fn().mockResolvedValue(new Response("%PDF-1.4 ...", { status: 200 }));
    await expect(downloadPdf("http://x", f)).resolves.toBeInstanceOf(Buffer);
  });
  it("rejects ZIPs and oversized files", async () => {
    const zip = vi.fn().mockResolvedValue(new Response("PK\u0003\u0004...", { status: 200 }));
    await expect(downloadPdf("http://x", zip)).rejects.toThrow("não é um PDF");
    const big = vi.fn().mockResolvedValue(new Response("%PDF-", { status: 200, headers: { "content-length": String(30 * 1024 * 1024) } }));
    await expect(downloadPdf("http://x", big)).rejects.toThrow("25 MB");
  });
});
