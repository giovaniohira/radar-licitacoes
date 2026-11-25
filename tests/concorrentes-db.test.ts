// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendDigests } from "@/lib/alerts";
import {
  MAX_CONCORRENTES,
  MAX_NO_EMAIL,
  TITULO_DA_SECAO,
  contratosDosConcorrentes,
  estaSeguindo,
  listarSeguidos,
  marcarVistos,
  pararDeSeguir,
  seguirConcorrente,
  usuariosQueSeguem,
} from "@/lib/concorrentes";
import { closePool, pool } from "@/lib/db";

const url = process.env.TEST_DATABASE_URL;

let n = 0;
const cnpj = (i: number) => String(10_000_000_000_000 + i);
async function contrato(ni: string | null, diasAtras = 1, extra: Record<string, unknown> = {}) {
  const id = `99000000000002-2-${String(++n).padStart(6, "0")}/2026`;
  const c = { objeto: "Fornecimento de material de limpeza", orgao: "PREFEITURA DE CAMPINAS", orgao_cnpj: "46344354000108", uf: "SP", municipio: "Campinas", fornecedor: "LIMPA TUDO LTDA", valor_global: 50_000, ...extra };
  await pool().query(
    `insert into contratos (id, orgao_cnpj, orgao, uf, municipio, fornecedor_ni, fornecedor, tipo_pessoa, objeto, valor_global, publicado_em, raw)
     values ($1, $2, $3, $4, $5, $6, $7, 'PJ', $8, $9, now() - $10::numeric * interval '1 day', '{}')`,
    [id, c.orgao_cnpj, c.orgao, c.uf, c.municipio, ni, c.fornecedor, c.objeto, c.valor_global, diasAtras],
  );
  return id;
}
async function usuario(email: string) {
  return (await pool().query<{ id: number }>(`insert into users (email, onboarding_em) values ($1, now()) returning id`, [email])).rows[0].id;
}

describe.skipIf(!url)("acompanhar concorrente (banco)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await pool().query("drop schema public cascade; create schema public;");
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  });
  afterAll(closePool);

  it("follows and unfollows, only companies that have contracts, once each", async () => {
    const db = pool();
    const ana = await usuario("ana@teste.com");
    const beto = await usuario("beto@teste.com");
    await contrato(cnpj(1));
    expect(await seguirConcorrente(db, ana, cnpj(1))).toBeNull();
    expect(await seguirConcorrente(db, ana, cnpj(1))).toBeNull(); // twice is harmless
    expect(await listarSeguidos(db, ana)).toMatchObject([{ fornecedor_ni: cnpj(1), nome: "LIMPA TUDO LTDA" }]);
    expect(await estaSeguindo(db, ana, cnpj(1))).toBe(true);
    expect(await estaSeguindo(db, beto, cnpj(1))).toBe(false);

    expect(await seguirConcorrente(db, ana, "12345678901")).toMatch(/CNPJ/); // an individual's CPF
    expect(await seguirConcorrente(db, ana, cnpj(999))).toMatch(/Não achamos/); // no contract of that company
    expect(await listarSeguidos(db, ana)).toHaveLength(1);

    await pararDeSeguir(db, beto, cnpj(1)); // someone else's follow is not touched
    expect(await estaSeguindo(db, ana, cnpj(1))).toBe(true);
    await pararDeSeguir(db, ana, cnpj(1));
    expect(await estaSeguindo(db, ana, cnpj(1))).toBe(false);
  });

  it("stops at 20 per account and lets one in again after one is dropped", async () => {
    const db = pool();
    const u = await usuario("limite@teste.com");
    for (let i = 100; i < 100 + MAX_CONCORRENTES + 1; i++) await contrato(cnpj(i));
    for (let i = 100; i < 100 + MAX_CONCORRENTES; i++) expect(await seguirConcorrente(db, u, cnpj(i))).toBeNull();
    expect(await seguirConcorrente(db, u, cnpj(100 + MAX_CONCORRENTES))).toMatch(/20 concorrentes/);
    expect(await listarSeguidos(db, u)).toHaveLength(MAX_CONCORRENTES);
    expect(await seguirConcorrente(db, u, cnpj(100))).toBeNull(); // already followed: fine at the limit
    await pararDeSeguir(db, u, cnpj(100));
    expect(await seguirConcorrente(db, u, cnpj(100 + MAX_CONCORRENTES))).toBeNull();
  });

  it("brings the new contracts of followed companies, newest first, each once, within the last week", async () => {
    const db = pool();
    await db.query(`delete from concorrente_envios; delete from concorrentes; delete from contratos;`);
    const u = await usuario("novos@teste.com");
    const outro = await usuario("outro@teste.com");
    const velho = await contrato(cnpj(1), 20);
    const a = await contrato(cnpj(1), 3);
    const b = await contrato(cnpj(2), 1);
    await contrato(cnpj(3), 1); // not followed
    await seguirConcorrente(db, u, cnpj(1));
    await seguirConcorrente(db, u, cnpj(2));
    const r = await contratosDosConcorrentes(db, u);
    expect(r.itens.map((x) => x.id)).toEqual([b, a]);
    expect(r.itens.some((x) => x.id === velho)).toBe(false);
    expect(r.alemDoLimite).toBe(0);
    expect((await contratosDosConcorrentes(db, outro)).itens).toEqual([]);

    await marcarVistos(db, u);
    expect((await contratosDosConcorrentes(db, u)).itens).toEqual([]);
    const c = await contrato(cnpj(2), 0); // a new one appears later
    expect((await contratosDosConcorrentes(db, u)).itens.map((x) => x.id)).toEqual([c]);
  });

  it("lists ten and counts the rest, which are then seen too", async () => {
    const db = pool();
    await db.query(`delete from concorrente_envios; delete from concorrentes; delete from contratos;`);
    const u = await usuario("muitos@teste.com");
    for (let i = 0; i < 14; i++) await contrato(cnpj(1), 1 + i / 100);
    await seguirConcorrente(db, u, cnpj(1));
    const r = await contratosDosConcorrentes(db, u);
    expect(r.itens).toHaveLength(MAX_NO_EMAIL);
    expect(r.alemDoLimite).toBe(4);
    await marcarVistos(db, u);
    expect((await contratosDosConcorrentes(db, u)).itens).toEqual([]);
  });

  it("sends the digest with only this section when there is no new edital, and once per contract", async () => {
    const db = pool();
    await db.query(`delete from concorrente_envios; delete from concorrentes; delete from contratos; delete from alerts; delete from editais;`);
    const u = await usuario("so-concorrentes@teste.com");
    await contrato(cnpj(7), 1, { fornecedor: "RIVAL SERVICOS LTDA" });
    await seguirConcorrente(db, u, cnpj(7));
    expect((await usuariosQueSeguem(db)).map((x) => x.email)).toContain("so-concorrentes@teste.com");

    const saidas: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void saidas.push(String(m)));
    delete process.env.SMTP_URL;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    const texto = saidas.join("\n");
    expect(texto).toContain("para: so-concorrentes@teste.com");
    expect(texto).toContain("assunto: 1 contrato novo dos seus concorrentes");
    expect(texto).toContain(TITULO_DA_SECAO);
    expect(texto).toContain("Rival Servicos LTDA assinou contrato com");
    expect(texto).toContain("https://x.test/fornecedor/" + cnpj(7));

    // The next run sends nothing: the contract was shown.
    saidas.length = 0;
    expect(await sendDigests(db, "https://x.test")).toBe(0);
    // A new contract of the same company sends it again, with only the new one.
    await contrato(cnpj(7), 0, { objeto: "Serviço de vigilância" });
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    log.mockRestore();
    expect(saidas.join("\n")).toContain("vigilância");
    expect(saidas.join("\n")).not.toContain("material de limpeza");
  });

  it("goes after the editais in the normal digest", async () => {
    const db = pool();
    await db.query(`delete from concorrente_envios; delete from concorrentes; delete from contratos; delete from alerts; delete from editais; delete from alert_envios;`);
    const u = await usuario("completo@teste.com");
    await db.query(`insert into alerts (user_id, nome, palavras, ufs, modalidades, ativo) values ($1, 'TI', 'notebooks', '{}', '{}', true)`, [u]);
    await db.query(
      `insert into editais (id, cnpj, ano, sequencial, orgao, objeto, modalidade_id, encerramento, publicado_em, raw)
       values ('99000000000003-1-000001/2026', '99000000000003', 2026, 1, 'ORGAO', 'Aquisição de notebooks', 6, now() + interval '9 days', now(), '{}')`,
    );
    await contrato(cnpj(8), 1);
    await seguirConcorrente(db, u, cnpj(8));
    const saidas: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void saidas.push(String(m)));
    delete process.env.SMTP_URL;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    log.mockRestore();
    const t = saidas.join("\n");
    expect(t).toContain("assunto: 1 novo edital para você");
    expect(t.indexOf("Aquisição de notebooks")).toBeLessThan(t.indexOf(TITULO_DA_SECAO));
  });
});
