import { afterEach, describe, expect, it } from "vitest";
import { renderDigest, type Alert } from "@/lib/alerts";
import { blocoDoResumo, escolherParaResumo, tetoDiario } from "@/lib/resumo-email";
import type { EditalResumo } from "@/lib/search";
import type { Resumo } from "@/lib/summary";

const AGORA = new Date("2026-11-23T10:00:00Z");
const emDias = (d: number) => new Date(AGORA.getTime() + d * 86_400_000);

const resumo = (o: Partial<Resumo> = {}): Resumo => ({
  objeto: "Aquisição de 40 notebooks para a secretaria. Entrega em 30 dias.",
  valor_estimado: "R$ 200.000,00",
  prazos: [
    { evento: "Sessão pública", data: "02/12/2026 10:00" },
    { evento: "Limite de propostas", data: "02/12/2026 09:00" },
  ],
  exigencias_habilitacao: ["Certidão negativa"],
  exclusivo_me_epp: true,
  garantia: "não exige",
  criterio_julgamento: "menor preço",
  local_entrega_execucao: "Curitiba/PR",
  pontos_de_atencao: ["Amostra em 3 dias úteis", "Visita técnica obrigatória", "Multa de 10% por atraso"],
  ...o,
});

const edital = (id: string, dias: number | null): EditalResumo =>
  ({
    id,
    objeto: `OBJETO DO EDITAL ${id}`,
    orgao: "PREFEITURA TESTE",
    municipio: "Curitiba",
    uf: "PR",
    modalidade: "Pregão",
    valor_estimado: 10000,
    encerramento: dias == null ? null : emDias(dias),
  }) as EditalResumo;

const alert = { id: 1, user_id: 1, nome: "TI", palavras: "notebook", ufs: [], modalidades: [], valor_min: null, valor_max: null } as Alert;

describe("escolherParaResumo", () => {
  it("takes the three nearest deadlines that still leave 3 days, without repeats", () => {
    const lista = [edital("a", 9), edital("b", 2), edital("c", 3.5), edital("d", null), edital("e", 5), edital("f", 7), edital("c", 3.5)];
    expect(escolherParaResumo(lista, AGORA).map((e) => e.id)).toEqual(["c", "e", "f"]);
    expect(escolherParaResumo([edital("x", 2.9), edital("y", 1)], AGORA)).toEqual([]);
    expect(escolherParaResumo([edital("x", 3)], AGORA).map((e) => e.id)).toEqual(["x"]);
  });
});

describe("blocoDoResumo", () => {
  it("keeps the first sentence, the bid deadline, ME/EPP and two attention points", () => {
    expect(blocoDoResumo(resumo())).toEqual({
      objeto: "Aquisição de 40 notebooks para a secretaria.",
      prazo: "Limite de propostas: 02/12/2026 09:00",
      meEpp: "Exclusivo ME/EPP",
      atencao: ["Amostra em 3 dias úteis", "Visita técnica obrigatória"],
    });
  });

  it("copes with a thin summary", () => {
    const b = blocoDoResumo(resumo({ prazos: [], exclusivo_me_epp: false, pontos_de_atencao: [" ", ""] }));
    expect(b).toMatchObject({ prazo: null, meEpp: "Ampla concorrência", atencao: [] });
    expect(blocoDoResumo(resumo({ prazos: [{ evento: "Sessão pública", data: "01/12/2026" }] })).prazo).toBe("Sessão pública: 01/12/2026");
  });
});

describe("renderDigest with summaries", () => {
  const grupos = [{ alert, editais: [edital("curto", 1), edital("e1", 4), edital("e2", 5), edital("e3", 6), edital("e4", 8), edital("sem-resumo", 4.5)] }];

  it("adds the block to the three nearest eligible editais that have a summary, and nothing else changes", () => {
    const resumos = new Map([
      ["curto", resumo()], // closes in 1 day: never gets a block
      ["e1", resumo()],
      ["e2", resumo({ objeto: 'Compra de <b>itens</b> & "peças".', exclusivo_me_epp: false })],
      ["e3", resumo()], // fourth eligible: no block
      ["e4", resumo()],
    ]);
    const sem = renderDigest("https://x.test", grupos, AGORA);
    const com = renderDigest("https://x.test", grupos, AGORA, resumos);

    expect(com.subject).toBe(sem.subject);
    // sem-resumo (4.5 days) is the second nearest eligible but has no summary: it goes without a block, not with an error.
    expect((com.html.match(/Resumo por IA · confira no edital/g) ?? []).length).toBe(2);
    expect(com.html).toContain("Compra de &lt;b&gt;itens&lt;/b&gt; &amp; &quot;peças&quot;.");
    expect(com.html).toContain("Exclusivo ME/EPP");
    expect(com.html).toContain("Ampla concorrência");
    expect(com.html).toContain("https://x.test/edital/e1");
    expect(com.html).not.toMatch(/undefined|null|NaN/);
    expect(sem.html).not.toContain("Resumo por IA");
    expect(sem.text).not.toContain("Resumo por IA");
  });

  it("writes the same content in the text version", () => {
    const resumos = new Map([["e1", resumo()]]);
    const { text } = renderDigest("https://x.test", grupos, AGORA, resumos);
    expect(text).toContain("Resumo por IA (confira no edital): Aquisição de 40 notebooks para a secretaria.");
    expect(text).toContain("Prazo: Limite de propostas: 02/12/2026 09:00");
    expect(text).toContain("Atenção: Amostra em 3 dias úteis");
    expect(text).toContain("Ver resumo completo: https://x.test/edital/e1");
  });

  it("shows an edital listed by two alerts under the first only", () => {
    const duplo = [
      { alert, editais: [edital("e1", 4)] },
      { alert: { ...alert, id: 2, nome: "Outro" }, editais: [edital("e1", 4)] },
    ];
    const { html } = renderDigest("https://x.test", duplo, AGORA, new Map([["e1", resumo()]]));
    expect((html.match(/Resumo por IA · confira/g) ?? []).length).toBe(1);
  });
});

describe("tetoDiario", () => {
  const original = process.env.RESUMO_EMAIL_TETO_DIARIO;
  afterEach(() => {
    if (original === undefined) delete process.env.RESUMO_EMAIL_TETO_DIARIO;
    else process.env.RESUMO_EMAIL_TETO_DIARIO = original;
  });

  it("defaults to 100 and accepts 0 to switch the feature off", () => {
    delete process.env.RESUMO_EMAIL_TETO_DIARIO;
    expect(tetoDiario()).toBe(100);
    process.env.RESUMO_EMAIL_TETO_DIARIO = "7";
    expect(tetoDiario()).toBe(7);
    process.env.RESUMO_EMAIL_TETO_DIARIO = "0";
    expect(tetoDiario()).toBe(0);
    process.env.RESUMO_EMAIL_TETO_DIARIO = "abc";
    expect(tetoDiario()).toBe(100);
  });
});
