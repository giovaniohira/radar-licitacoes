import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { brDate, getJson, normalize, normalizeContrato, pickEdital, PncpError, type PncpArquivo, type PncpContrato, type PncpPage, type PncpContratacao } from "@/lib/pncp";
import { sanitizeContrato } from "@/lib/ingest";

const page = JSON.parse(readFileSync(new URL("./fixtures/publicacao.json", import.meta.url), "utf8")) as PncpPage<PncpContratacao>;

describe("brDate", () => {
  it("treats offset-less PNCP timestamps as Brasília time", () => {
    expect(brDate("2026-10-23T07:59:00")).toBe("2026-10-23T10:59:00.000Z");
  });
  it("accepts date-only values and explicit offsets", () => {
    expect(brDate("2026-10-23")).toBe("2026-10-23T03:00:00.000Z");
    expect(brDate("2026-10-23T07:59:00Z")).toBe("2026-10-23T07:59:00.000Z");
  });
  it("returns null for empty or invalid input", () => {
    expect(brDate(null)).toBeNull();
    expect(brDate("lixo")).toBeNull();
  });
});

describe("normalize", () => {
  it("maps a real PNCP record", () => {
    const raw = page.data[0];
    const e = normalize(raw);
    expect(e.id).toBe(raw.numeroControlePNCP);
    expect(e.cnpj).toMatch(/^\d{14}$/);
    expect(e.uf).toMatch(/^[A-Z]{2}$/);
    expect(e.modalidade_id).toBe(6);
    expect(e.objeto).toBe(raw.objetoCompra.replace(/\s+/g, " ").trim());
    expect(e.encerramento).toBe(brDate(raw.dataEncerramentoProposta));
  });

  it("fills gaps instead of failing", () => {
    const e = normalize({
      numeroControlePNCP: "1-1-000001/2026",
      anoCompra: 2026,
      sequencialCompra: 1,
      orgaoEntidade: { cnpj: "00000000000191", razaoSocial: "  ÓRGÃO   X " },
      unidadeOrgao: null,
      objetoCompra: "   ",
      modalidadeId: 8,
    });
    expect(e.orgao).toBe("ÓRGÃO X");
    expect(e.objeto).toBe("(sem objeto informado)");
    expect(e.modalidade).toBe("Dispensa");
    expect(e.uf).toBeNull();
    expect(e.valor_estimado).toBeNull();
  });
});

describe("pickEdital", () => {
  const arq = (seq: number, titulo: string, tipo = "Outros", ativo = true): PncpArquivo => ({
    url: `u${seq}`,
    titulo,
    sequencialDocumento: seq,
    tipoDocumentoNome: tipo,
    statusAtivo: ativo,
  });

  it("prefers the edital over annexes and spreadsheets", () => {
    const pick = pickEdital([arq(1, "Tabela de Itens do Edital", "Edital"), arq(2, "Edital Pregão 56/2026", "Edital"), arq(3, "Anexo I")]);
    expect(pick?.url).toBe("u2");
  });
  it("ignores inactive documents", () => {
    expect(pickEdital([arq(1, "Edital", "Edital", false)])).toBeNull();
  });
});

describe("getJson", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const noSleep = { sleep: async () => {} };

  it("retries 429 and 5xx, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok({ a: 1 }));
    await expect(getJson("http://x", { fetchImpl, ...noSleep })).resolves.toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns null on 204 (no results)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(getJson("http://x", { fetchImpl, ...noSleep })).resolves.toBeNull();
  });

  it("does not retry 4xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(getJson("http://x", { fetchImpl, ...noSleep })).rejects.toBeInstanceOf(PncpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(getJson("http://x", { fetchImpl, retries: 2, ...noSleep })).rejects.toThrow("PNCP 500");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("contracts", () => {
  const contratos = JSON.parse(readFileSync(new URL("./fixtures/contratos.json", import.meta.url), "utf8")) as PncpContrato[];

  it("normalizes a real contract", () => {
    const c = normalizeContrato(contratos[0]);
    expect(c.id).toBe(contratos[0].numeroControlePNCP);
    expect(c.compra_id).toBe(contratos[0].numeroControlePncpCompra);
    expect(c.fornecedor_ni).toMatch(/^\d{14}$/);
    expect(c.data_assinatura).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.valor_global).toBe(contratos[0].valorGlobal);
  });

  it("keeps individuals anonymous, in columns and in the raw payload", () => {
    const pf = contratos.find((c) => c.tipoPessoa === "PF")!;
    const row = normalizeContrato(pf);
    expect(row.fornecedor_ni).toBeNull();
    expect(row.fornecedor).toBe("Pessoa física");
    const raw = sanitizeContrato(pf);
    expect(raw.niFornecedor).toBeNull();
    expect(raw.nomeRazaoSocialFornecedor).toBeNull();
  });

  it("drops impossible dates and values", () => {
    const c = normalizeContrato({ ...contratos[0], dataVigenciaFim: "7203-07-27", valorGlobal: -10, valorInicial: null });
    expect(c.vigencia_fim).toBeNull();
    expect(c.valor_global).toBeNull();
  });
});
