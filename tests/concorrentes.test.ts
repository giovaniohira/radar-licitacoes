import { describe, expect, it } from "vitest";
import { renderDigest } from "@/lib/alerts";
import { TITULO_DA_SECAO, apenasDigitos, ehCnpj, htmlDaSecao, linhaDeResumo, partesDoContrato, textoDaSecao, vazio, type ContratoDoConcorrente } from "@/lib/concorrentes";

const c = (extra: Partial<ContratoDoConcorrente> = {}): ContratoDoConcorrente => ({
  id: "1",
  fornecedor: "LIMPA TUDO COMERCIO LTDA",
  fornecedor_ni: "12345678000190",
  objeto: "FORNECIMENTO DE MATERIAL DE LIMPEZA PARA AS ESCOLAS",
  orgao: "PREFEITURA MUNICIPAL DE CAMPINAS",
  orgao_cnpj: "46344354000108",
  municipio: "CAMPINAS",
  uf: "SP",
  valor_global: 125000,
  ...extra,
});
const sp = (t: string) => t.replace(/ /g, " ");

describe("linhas dos concorrentes", () => {
  it("reads as '{Fornecedor} assinou contrato com {órgão}, {cidade-UF}: {objeto}, {valor}'", () => {
    const p = partesDoContrato(c());
    expect(sp(p.quem + p.resto)).toBe("Limpa Tudo Comercio LTDA assinou contrato com Prefeitura Municipal de Campinas, SP: Material de limpeza para as escolas, R$ 125.000");
  });

  it("leaves out a value that PNCP reports as zero or missing", () => {
    expect(sp(partesDoContrato(c({ valor_global: 0 })).resto)).not.toMatch(/R\$/);
    expect(sp(partesDoContrato(c({ valor_global: null })).resto)).not.toMatch(/R\$/);
  });

  it("only digits make a CNPJ", () => {
    expect(apenasDigitos("12.345.678/0001-90")).toBe("12345678000190");
    expect(ehCnpj("12345678000190")).toBe(true);
    expect(ehCnpj("12345678901")).toBe(false); // an individual's CPF
    expect(ehCnpj("")).toBe(false);
  });
});

describe("renderDigest com a seção de concorrentes", () => {
  const cores = { text: "#18181b", muted: "#5f5f6b", border: "#e6e6e9" };
  const agora = new Date("2026-11-22T10:00:00Z");

  it("makes an e-mail with only this section when there is no edital", () => {
    const m = renderDigest("https://x.test", [], agora, new Map(), [], null, { itens: [c(), c({ id: "2" })], alemDoLimite: 0 });
    expect(m.subject).toBe("2 contratos novos dos seus concorrentes");
    expect(m.text).toContain(TITULO_DA_SECAO);
    expect(m.text).toContain("https://x.test/fornecedor/12345678000190");
    expect(m.html).toContain(TITULO_DA_SECAO);
    expect(m.html).toContain("porque acompanha concorrentes");
    expect(m.html).not.toContain("novos editais");
  });

  it("goes after the editais in a normal digest and keeps the edital subject", () => {
    const edital = { id: "x-1", objeto: "Notebooks", orgao: "Órgão", municipio: "Santos", uf: "SP", modalidade: "Pregão", valor_estimado: 1000, encerramento: "2026-12-30T13:00:00Z" } as never;
    const alert = { id: 1, user_id: 1, nome: "TI", palavras: "notebooks", ufs: [], modalidades: [], valor_min: null, valor_max: null };
    const m = renderDigest("https://x.test", [{ alert, editais: [edital] }], agora, new Map(), [], null, { itens: [c()], alemDoLimite: 0 });
    expect(m.subject).toBe("1 novo edital para você");
    expect(m.text.indexOf("Notebooks")).toBeLessThan(m.text.indexOf(TITULO_DA_SECAO));
    expect(m.html.indexOf("Notebooks")).toBeLessThan(m.html.indexOf(TITULO_DA_SECAO));
  });

  it("counts the contracts that did not fit and hides the section when empty", () => {
    const com = { itens: [c()], alemDoLimite: 3 };
    expect(linhaDeResumo(1)).toBe("e mais 1 contrato dos seus concorrentes");
    expect(textoDaSecao("https://x.test", com)).toContain("e mais 3 contratos dos seus concorrentes");
    expect(htmlDaSecao("https://x.test", com, cores)).toContain("e mais 3 contratos dos seus concorrentes");
    expect(renderDigest("https://x.test", [], agora, new Map(), [], null, { itens: [c()], alemDoLimite: 3 }).subject).toBe("4 contratos novos dos seus concorrentes");
    expect(vazio(null)).toBe(true);
    expect(vazio({ itens: [], alemDoLimite: 0 })).toBe(true);
    const m = renderDigest("https://x.test", [], agora, new Map(), [], null, { itens: [], alemDoLimite: 0 });
    expect(m.text).not.toContain(TITULO_DA_SECAO);
  });

  it("escapes what comes from the PNCP", () => {
    const html = htmlDaSecao("https://x.test", { itens: [c({ fornecedor: "A <b>&</b> B", objeto: "Café <script>x</script>" })], alemDoLimite: 0 }, cores);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>&</b>");
  });
});
