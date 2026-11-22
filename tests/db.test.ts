// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, pool } from "@/lib/db";
import { matchesForAlert, sendDigests, type Alert } from "@/lib/alerts";
import { ingestDia, upsertContratacoes, upsertContratos } from "@/lib/ingest";
import { analisar, contratosRecentes } from "@/lib/mercado";
import { addToPipeline, listPipeline, moveCard } from "@/lib/pipeline";
import { quemGanhou, termosDoObjeto } from "@/lib/quemganhou";
import type { PncpContratacao, PncpContrato, PncpPage } from "@/lib/pncp";
import { buildSearch, type EditalResumo } from "@/lib/search";

const url = process.env.TEST_DATABASE_URL;
const contratos = JSON.parse(readFileSync(new URL("./fixtures/contratos.json", import.meta.url), "utf8")) as PncpContrato[];
const page = JSON.parse(readFileSync(new URL("./fixtures/publicacao.json", import.meta.url), "utf8")) as PncpPage<PncpContratacao>;

// Push every deadline into the future so the "open only" filter keeps them.
const future = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 19);
const fixture = page.data.map((c) => ({ ...c, dataEncerramentoProposta: future }));

describe.skipIf(!url)("database", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const db = pool();
    await db.query("drop schema public cascade; create schema public;");
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  });
  afterAll(closePool);

  it("upserts idempotently", async () => {
    const first = await upsertContratacoes(pool(), fixture);
    expect(first).toEqual({ inseridos: fixture.length, atualizados: 0 });
    const again = await upsertContratacoes(pool(), fixture);
    expect(again).toEqual({ inseridos: 0, atualizados: 0 });
    const changed = await upsertContratacoes(pool(), [{ ...fixture[0], dataAtualizacaoGlobal: "2030-01-01T00:00:00", objetoCompra: "Objeto revisado" }]);
    expect(changed).toEqual({ inseridos: 0, atualizados: 1 });
  });

  it("finds editais by accent-insensitive keywords", async () => {
    const target = fixture[1];
    const word = target.objetoCompra
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split(/\W+/)
      .find((w) => w.length > 6)!;
    const { sql, params } = buildSearch({ palavras: word.toUpperCase() });
    const rows = (await pool().query<EditalResumo>(sql, params)).rows;
    expect(rows.map((r) => r.id)).toContain(target.numeroControlePNCP);
  });

  it("ingests paginated pages through the PNCP client", async () => {
    const pages = [
      { ...page, data: fixture.slice(0, 3), totalPaginas: 2, paginasRestantes: 1, numeroPagina: 1 },
      { ...page, data: fixture.slice(3), totalPaginas: 2, paginasRestantes: 0, numeroPagina: 2 },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      const p = Number(new URL(u).searchParams.get("pagina"));
      return new Response(JSON.stringify(pages[p - 1]), { status: 200 });
    }) as typeof fetch;
    const r = await ingestDia(pool(), "2026-10-15", { modalidades: [6], fetchOpts: { fetchImpl, minIntervalMs: 0 } });
    expect(r.registros).toBe(fixture.length);
    expect(urls).toHaveLength(2);
    const [run] = (await pool().query(`select paginas, registros from ingest_runs where dia = '2026-10-15' and modalidade_id = 6`)).rows;
    expect(run).toEqual({ paginas: 2, registros: fixture.length });
  });

  it("sends each edital once per alert", async () => {
    const db = pool();
    const [{ id: userId }] = (await db.query(`insert into users (email) values ('a@b.com') returning id`)).rows;
    const uf = fixture[0].unidadeOrgao!.ufSigla!;
    const [alert] = (
      await db.query<Alert>(`insert into alerts (user_id, nome, palavras, ufs) values ($1, 'teste', $2, $3) returning *`, [
        userId,
        fixture.map((c) => c.objetoCompra.split(/\s+/).filter((w) => w.length > 5)[0]).join(", "),
        [uf],
      ])
    ).rows;
    const before = await matchesForAlert(db, alert);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((e) => e.uf === uf)).toBe(true);

    expect(await sendDigests(db, "https://radar.test")).toBe(1);
    expect(await matchesForAlert(db, alert)).toHaveLength(0);
    expect(await sendDigests(db, "https://radar.test")).toBe(0);
  });

  it("keeps pipeline order and seeds the checklist from the AI summary", async () => {
    const db = pool();
    const [{ id: userId }] = (await db.query(`insert into users (email) values ('p@b.com') returning id`)).rows;
    const [a, b, c] = fixture.map((f) => f.numeroControlePNCP);
    await db.query(`insert into resumos (edital_id, documento, dados, modelo) values ($1, 'x.pdf', $2, 'm')`, [
      a,
      JSON.stringify({ exigencias_habilitacao: ["CND federal", "Atestado técnico"] }),
    ]);
    for (const id of [a, b, c]) await addToPipeline(db, userId, id);
    await addToPipeline(db, userId, a); // second add is a no-op
    let itens = await listPipeline(db, userId);
    expect(itens.map((i) => i.edital_id)).toEqual([a, b, c]);
    expect(itens.find((i) => i.edital_id === a)).toMatchObject({ check_total: 2, check_feito: 0 });

    await moveCard(db, userId, c, "analise", [c]);
    await moveCard(db, userId, a, "analise", [a, c]);
    itens = await listPipeline(db, userId);
    const analise = itens.filter((i) => i.etapa === "analise").map((i) => i.edital_id);
    expect(analise).toEqual([a, c]);
    expect(itens.filter((i) => i.etapa === "triagem").map((i) => i.edital_id)).toEqual([b]);

    // Another user's card is out of reach.
    await moveCard(db, userId + 999, b, "ganha", [b]);
    expect((await listPipeline(db, userId)).find((i) => i.edital_id === b)?.etapa).toBe("triagem");
  });

  it("upserts contracts and answers market questions", async () => {
    const db = pool();
    const recent = contratos.map((c) => ({ ...c, dataPublicacaoPncp: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 19) })); // 3 days back: "now" without a time zone lands in the next week on Sunday nights (Brasília)
    expect(await upsertContratos(db, recent)).toEqual({ inseridos: recent.length, atualizados: 0 });
    expect(await upsertContratos(db, recent)).toEqual({ inseridos: 0, atualizados: 0 });
    const [{ raw }] = (await db.query(`select raw from contratos where tipo_pessoa = 'PF'`)).rows;
    expect(raw.niFornecedor).toBeNull();

    const m = await analisar(db, { dias: 30 });
    expect(m.totais.contratos).toBe(recent.length);
    expect(m.fornecedores.every((f) => /^\d{14}$/.test(f.id))).toBe(true);
    expect(m.serie.reduce((n, p) => n + p.n, 0)).toBe(recent.length);
    const rows = await contratosRecentes(db, { orgao: recent[0].orgaoEntidade.cnpj, dias: 30 });
    expect(rows.every((r) => r.orgao_cnpj === recent[0].orgaoEntidade.cnpj)).toBe(true);
  });

  it("finds similar contracts of the same buyer only, newest first, never individuals", async () => {
    const db = pool();
    const A = "99000000000001";
    const B = "99000000000002";
    const [{ id: editalId }] = (await db.query<{ id: string }>(`select id from editais limit 1`)).rows;
    const novo = (id: string, cnpj: string, objeto: string, o: { ni?: string | null; pf?: boolean; valor?: number; dia: string; compra?: string | null }) =>
      db.query(
        `insert into contratos (id, compra_id, orgao_cnpj, orgao, fornecedor_ni, fornecedor, tipo_pessoa, objeto, valor_global, data_assinatura, raw)
         values ($1, $2, $3, 'ORGAO TESTE', $4, $5, $6, $7, $8, $9, '{}')`,
        [id, o.compra ?? null, cnpj, o.pf ? null : (o.ni ?? "11111111000191"), o.pf ? "Pessoa física" : "FORNECEDOR LTDA", o.pf ? "PF" : "PJ", objeto, o.valor ?? 1000, o.dia],
      );
    try {
      // Seven similar contracts of A (seguro veicular), so the list is capped at 5 while the total counts all of them.
      for (let i = 1; i <= 7; i++) await novo(`qg-a${i}`, A, `Contratação de seguro veicular para viatura ${i}`, { dia: `2026-0${i}-15`, valor: i * 1000 });
      await novo("qg-a-edital", A, "Contratação de seguro veicular para viatura da frota", { dia: "2026-09-01", valor: 5000, compra: editalId });
      await novo("qg-a-pf", A, "Seguro veicular contratado de pessoa física", { dia: "2026-10-01", pf: true });
      await novo("qg-a-uma-palavra", A, "Aquisição de seguro de vida", { dia: "2026-10-02" }); // shares only "seguro"
      await novo("qg-a-outro-assunto", A, "Pavimentação asfáltica de vias urbanas", { dia: "2026-10-03" });
      await novo("qg-b1", B, "Contratação de seguro veicular para viatura", { dia: "2026-10-04" }); // another buyer

      const termos = termosDoObjeto("Contratação de seguro veicular para viatura administrativa");
      expect(termos).toEqual(["seguro", "veicular", "viatura", "administrativa"]);
      const r = await quemGanhou(db, A, termos);

      expect(r.total).toBe(8); // 7 + the one linked to an edital; the individual, the one-word match, and buyer B do not count
      expect(r.contratos.map((c) => c.id)).toContain("qg-a-edital"); // as relevant as the others and the newest
      expect(r.contratos).toHaveLength(5);
      expect(r.contratos.every((c) => c.id.startsWith("qg-a") && c.id !== "qg-a-pf" && c.id !== "qg-a-uma-palavra")).toBe(true);
      const datas = r.contratos.map((c) => c.data_assinatura);
      expect(datas).toEqual([...datas].sort().reverse()); // newest first
      expect(datas[0]).toBe("2026-09-01");
      expect(r.desde).toBe("2026-01-15");
      expect(r.valorMin).toBe(1000);
      expect(r.valorMax).toBe(7000);
      expect(r.contratos.find((c) => c.id === "qg-a-edital")).toMatchObject({ tem_edital: true, compra_id: editalId });
      expect(r.contratos.filter((c) => c.id !== "qg-a-edital").every((c) => !c.tem_edital)).toBe(true);
      expect(r.contratos.every((c) => c.fornecedor !== "Pessoa física")).toBe(true);

      // Nothing similar, an empty word list and an unknown buyer all give an empty answer.
      expect((await quemGanhou(db, A, termosDoObjeto("Reforma de telhado da escola"))).total).toBe(0);
      expect((await quemGanhou(db, A, [])).contratos).toEqual([]);
      expect((await quemGanhou(db, "00000000000000", termos)).total).toBe(0);
    } finally {
      await db.query(`delete from contratos where id like 'qg-%'`);
    }
  });
});
