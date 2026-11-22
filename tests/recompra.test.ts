import { describe, expect, it } from "vitest";
import { renderDigest } from "@/lib/alerts";
import {
  AVISO_DA_SECAO,
  TITULO_DA_SECAO,
  fornecedorDe,
  htmlDaSecao,
  linhaDoProprio,
  partesDoItem,
  textoDaSecao,
  vazio,
  type Contrato,
} from "@/lib/recompra";
import type { EditalResumo } from "@/lib/search";

const c = (extra: Partial<Contrato> = {}): Contrato => ({
  id: "01-2-000001/2025",
  objeto: "AQUISIÇÃO DE MATERIAL DE LIMPEZA PARA AS ESCOLAS MUNICIPAIS",
  orgao: "PREFEITURA MUNICIPAL DE CAMPINAS",
  orgao_cnpj: "46344354000108",
  municipio: "CAMPINAS",
  uf: "SP",
  fornecedor: "LIMPA TUDO COMERCIO LTDA",
  fornecedor_ni: "12345678000190",
  valor_global: 125000.5,
  vigencia_fim: "2027-02-10",
  ...extra,
});

const edital = { id: "x-1", objeto: "Notebooks", orgao: "Órgão", municipio: "Santos", uf: "SP", modalidade: "Pregão", valor_estimado: 1000, encerramento: "2026-12-30T13:00:00Z" } as unknown as EditalResumo;
const alert = { id: 1, user_id: 1, nome: "TI", palavras: "notebook", ufs: [], modalidades: [], valor_min: null, valor_max: null };
const cores = { text: "#18181b", muted: "#5f5f6b", border: "#e6e6e9" };

const sp = (t: string) => t.replace(/ /g, " "); // formatBRL uses a no-break space

describe("linhas da recompra", () => {
  it("shows what, who buys, who has it now, how much and until when", () => {
    const itemDoTeste = partesDoItem(c());
    expect({ ...itemDoTeste, detalhe: sp(itemDoTeste.detalhe) }).toEqual({
      objeto: "Material de limpeza para as escolas municipais",
      comprador: "Prefeitura Municipal de Campinas · SP",
      detalhe: "Fornecedor atual: Limpa Tudo Comercio LTDA · Contrato de R$ 125.001 · termina em 10/02/2027",
    });
  });

  it("never names an individual: only a 14-digit company id brings the supplier name", () => {
    expect(fornecedorDe(c())).toBe("Limpa Tudo Comercio LTDA");
    expect(fornecedorDe(c({ fornecedor: "JOSE DA SILVA", fornecedor_ni: "12345678901" }))).toBeNull();
    expect(fornecedorDe(c({ fornecedor: "JOSE DA SILVA", fornecedor_ni: null }))).toBeNull();
    const p = partesDoItem(c({ fornecedor: "JOSE DA SILVA", fornecedor_ni: "12345678901" }));
    expect(p.detalhe).not.toMatch(/jose|silva/i);
    expect(sp(p.detalhe)).toBe("Contrato de R$ 125.001 · termina em 10/02/2027");
  });

  it("writes the own-contract line the spec asks for", () => {
    expect(linhaDoProprio(c())).toBe("Seu contrato com Prefeitura Municipal de Campinas termina em 10/02/2027. O órgão pode prorrogar ou abrir novo edital: vale acompanhar.");
  });
});

describe("renderDigest com a seção de recompra", () => {
  const grupos = [{ alert, editais: [edital] }];

  it("puts the section after the editais, with the order link, and the caveat", () => {
    const m = renderDigest("https://x.test", grupos, new Date("2026-11-22T10:00:00Z"), new Map(), [], { itens: [c()], proprios: [] });
    expect(m.text).toContain(TITULO_DA_SECAO);
    expect(m.text).toContain("https://x.test/orgao/46344354000108");
    expect(m.text).toContain(AVISO_DA_SECAO);
    expect(m.text.indexOf("Notebooks")).toBeLessThan(m.text.indexOf(TITULO_DA_SECAO));
    expect(m.text.indexOf(TITULO_DA_SECAO)).toBeLessThan(m.text.indexOf("Gerenciar alertas"));
    expect(m.html).toContain(TITULO_DA_SECAO);
    expect(m.html).toContain('href="https://x.test/orgao/46344354000108"');
    expect(m.html.indexOf("Notebooks")).toBeLessThan(m.html.indexOf(TITULO_DA_SECAO));
    expect(m.html.indexOf(TITULO_DA_SECAO)).toBeLessThan(m.html.indexOf("Abrir Minhas disputas"));
  });

  it("hides the section when there is nothing, and shows only the own line when that is all", () => {
    for (const r of [null, { itens: [], proprios: [] }]) {
      const m = renderDigest("https://x.test", grupos, new Date("2026-11-22T10:00:00Z"), new Map(), [], r);
      expect(m.text).not.toContain(TITULO_DA_SECAO);
      expect(m.html).not.toContain(TITULO_DA_SECAO);
    }
    expect(vazio({ itens: [], proprios: [] })).toBe(true);
    const so = renderDigest("https://x.test", grupos, new Date("2026-11-22T10:00:00Z"), new Map(), [], { itens: [], proprios: [c()] });
    expect(so.text).toContain("Seu contrato com Prefeitura Municipal de Campinas termina em 10/02/2027");
    expect(so.html).toContain("O órgão pode prorrogar ou abrir novo edital: vale acompanhar.");
  });

  it("escapes what comes from the PNCP", () => {
    const html = htmlDaSecao("https://x.test", { itens: [c({ objeto: "Café <script>alert(1)</script>", orgao: 'A "B" & C' })], proprios: [] }, cores);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(textoDaSecao("https://x.test", { itens: [c()], proprios: [] })).toContain("termina em 10/02/2027");
  });
});
