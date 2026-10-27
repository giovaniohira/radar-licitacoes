// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, pool } from "@/lib/db";
import { matchesForAlert, sendDigests, type Alert } from "@/lib/alerts";
import { ingestDia, upsertContratacoes, upsertContratos } from "@/lib/ingest";
import { analisar, contratosRecentes } from "@/lib/mercado";
import { addToPipeline, listPipeline, moveCard } from "@/lib/pipeline";
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
    const recent = contratos.map((c) => ({ ...c, dataPublicacaoPncp: new Date().toISOString().slice(0, 19) }));
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
});
