// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, pool } from "@/lib/db";
import { matchesForAlert, sendDigests, type Alert } from "@/lib/alerts";
import { ingestDia, upsertContratacoes } from "@/lib/ingest";
import type { PncpContratacao, PncpPage } from "@/lib/pncp";
import { buildSearch, type EditalResumo } from "@/lib/search";

const url = process.env.TEST_DATABASE_URL;
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
});
