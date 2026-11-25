// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendDigests } from "@/lib/alerts";
import { hojeBR } from "@/lib/certidoes";
import { closePool, pool } from "@/lib/db";
import { MAX_NO_EMAIL, TITULO_DA_SECAO, marcarEnviadas, recomprasDoUsuario, recomprasEnviadas } from "@/lib/recompra";

const url = process.env.TEST_DATABASE_URL;
const somar = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const HOJE = hojeBR();
const alerta = (palavras: string, extra: Partial<{ ufs: string[]; valor_min: string | null; valor_max: string | null }> = {}) => ({
  palavras,
  ufs: [],
  valor_min: null,
  valor_max: null,
  ...extra,
});

let n = 0;
async function contrato(dias: number, extra: Record<string, unknown> = {}) {
  const id = `99000000000001-2-${String(++n).padStart(6, "0")}/2025`;
  const c = {
    objeto: "Fornecimento de material de limpeza",
    uf: "SP",
    municipio: "Campinas",
    orgao_cnpj: "46344354000108",
    orgao: "PREFEITURA DE CAMPINAS",
    fornecedor_ni: "12345678000190",
    fornecedor: "LIMPA TUDO LTDA",
    tipo_pessoa: "PJ",
    valor_global: 50_000,
    ...extra,
  };
  await pool().query(
    `insert into contratos (id, orgao_cnpj, orgao, uf, municipio, fornecedor_ni, fornecedor, tipo_pessoa, objeto, valor_global, vigencia_fim, raw)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, '{}')`,
    [id, c.orgao_cnpj, c.orgao, c.uf, c.municipio, c.fornecedor_ni, c.fornecedor, c.tipo_pessoa, c.objeto, c.valor_global, somar(HOJE, dias)],
  );
  return id;
}
async function usuario(email: string, cnpj: string | null = null) {
  return (await pool().query<{ id: number }>(`insert into users (email, cnpj, onboarding_em) values ($1, $2, now()) returning id`, [email, cnpj])).rows[0].id;
}

describe.skipIf(!url)("radar de recompra (banco)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await pool().query("drop schema public cascade; create schema public;");
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  });
  afterAll(closePool);

  it("looks only 30 to 90 days ahead, inclusive, and only at contracts with an end date", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const u = await usuario("janela@teste.com");
    const [d29, d30, d60, d90, d91] = await Promise.all([29, 30, 60, 90, 91].map((d) => contrato(d)));
    await db.query(`insert into contratos (id, orgao_cnpj, orgao, objeto, raw) values ('sem-fim', '1', 'O', 'Material de limpeza', '{}')`);
    const r = await recomprasDoUsuario(db, u, [alerta("limpeza")], HOJE);
    expect(r.itens.map((c) => c.id)).toEqual([d30, d60, d90]);
    expect([d29, d91, "sem-fim"].some((x) => r.itens.some((c) => c.id === x))).toBe(false);
    expect(r.itens[0].vigencia_fim).toBe(somar(HOJE, 30));
  });

  it("applies the words, the UFs and the value range of the alert, and ignores an alert with no words", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const u = await usuario("filtros@teste.com");
    const limpezaSP = await contrato(40, { valor_global: 10_000 });
    const limpezaRJ = await contrato(41, { uf: "RJ", valor_global: 10_000 });
    const limpezaCara = await contrato(42, { valor_global: 900_000 });
    const limpezaBarata = await contrato(43, { valor_global: 100 });
    const notebooks = await contrato(44, { objeto: "Aquisição de notebooks" });
    const ids = async (a: ReturnType<typeof alerta>[]) => (await recomprasDoUsuario(db, u, a, HOJE)).itens.map((c) => c.id).sort();

    expect(await ids([alerta("limpeza")])).toEqual([limpezaSP, limpezaRJ, limpezaCara, limpezaBarata].sort());
    expect(await ids([alerta("limpeza", { ufs: ["SP"] })])).toEqual([limpezaSP, limpezaCara, limpezaBarata].sort());
    expect(await ids([alerta("limpeza", { ufs: ["sp"], valor_min: "1000", valor_max: "100000" })])).toEqual([limpezaSP]);
    expect(await ids([alerta("notebooks")])).toEqual([notebooks]);
    expect(await ids([alerta("")])).toEqual([]); // no words would match everything: no section from this alert
    // Two alerts that find the same contract list it once.
    expect(await ids([alerta("limpeza", { ufs: ["RJ"] }), alerta("material de limpeza", { ufs: ["RJ"] })])).toEqual([limpezaRJ]);
  });

  it("never lists an individual", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const u = await usuario("pf@teste.com");
    const pj = await contrato(50);
    await contrato(51, { tipo_pessoa: "PF", fornecedor: "JOSE DA SILVA", fornecedor_ni: "12345678901" });
    const r = await recomprasDoUsuario(db, u, [alerta("limpeza")], HOJE);
    expect(r.itens.map((c) => c.id)).toEqual([pj]);
  });

  it("brings at most five, the ones that end first", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const u = await usuario("cinco@teste.com");
    const ids: string[] = [];
    for (let d = 35; d < 45; d++) ids.push(await contrato(d));
    const r = await recomprasDoUsuario(db, u, [alerta("limpeza")], HOJE);
    expect(MAX_NO_EMAIL).toBe(5);
    expect(r.itens.map((c) => c.id)).toEqual(ids.slice(0, 5));
  });

  it("keeps the user's own contracts out of the list and shows them on a line of their own", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const meu = "11222333000181";
    const u = await usuario("fornecedor@teste.com", meu);
    const deOutro = await contrato(60);
    const dele = await contrato(55, { fornecedor_ni: meu, fornecedor: "MINHA EMPRESA LTDA" });
    const r = await recomprasDoUsuario(db, u, [alerta("limpeza")], HOJE, { cnpj: meu });
    expect(r.itens.map((c) => c.id)).toEqual([deOutro]);
    expect(r.proprios.map((c) => c.id)).toEqual([dele]);
    // An account without a CNPJ sees the contract as any other.
    const u2 = await usuario("sem-cnpj@teste.com");
    expect((await recomprasDoUsuario(db, u2, [alerta("limpeza")], HOJE)).itens.map((c) => c.id)).toEqual([dele, deOutro].sort((a, b) => (a === dele ? -1 : 1) - (b === dele ? -1 : 1)));
    expect((await recomprasDoUsuario(db, u2, [alerta("limpeza")], HOJE)).proprios).toEqual([]);
  });

  it("shows a contract once per user, and lists on /painel what was sent", async () => {
    const db = pool();
    await db.query(`delete from contratos`);
    const a = await usuario("a@teste.com");
    const b = await usuario("b@teste.com");
    const c1 = await contrato(45);
    const c2 = await contrato(46);
    const antes = await recomprasDoUsuario(db, a, [alerta("limpeza")], HOJE);
    expect(antes.itens.map((c) => c.id)).toEqual([c1, c2]);
    expect(await recomprasEnviadas(db, a, HOJE)).toEqual([]); // nothing sent yet: nothing on the card
    await marcarEnviadas(db, a, antes);
    await marcarEnviadas(db, a, antes); // twice is harmless
    expect((await recomprasDoUsuario(db, a, [alerta("limpeza")], HOJE)).itens).toEqual([]);
    expect((await recomprasEnviadas(db, a, HOJE)).map((c) => c.id)).toEqual([c1, c2]);
    // Another user is not affected.
    expect((await recomprasDoUsuario(db, b, [alerta("limpeza")], HOJE)).itens.map((c) => c.id)).toEqual([c1, c2]);
    // A sent contract whose end date has passed leaves the card.
    expect(await recomprasEnviadas(db, a, somar(HOJE, 46))).toEqual([expect.objectContaining({ id: c2 })]);
    expect(await recomprasEnviadas(db, a, somar(HOJE, 47))).toEqual([]);
  });

  it("goes out in the 7h e-mail after the editais, once per contract, and not at all when there is none", async () => {
    const db = pool();
    await db.query(`delete from contratos; delete from alert_envios; delete from alerts; delete from editais; delete from recompra_envios;`);
    const u = await usuario("digest-recompra@teste.com");
    await db.query(`insert into alerts (user_id, nome, palavras, ufs, modalidades, ativo) values ($1, 'Limpeza', 'limpeza', '{}', '{}', true)`, [u]);
    const novoEdital = (seq: number) =>
      db.query(
        `insert into editais (id, cnpj, ano, sequencial, orgao, objeto, modalidade_id, encerramento, publicado_em, raw)
         values ($1, '99000000000007', 2026, $2, 'ORGAO', 'Material de limpeza para escolas', 6, now() + interval '9 days', now(), '{}')`,
        [`99000000000007-1-00000${seq}/2026`, seq],
      );
    const primeiro = await contrato(40);
    await novoEdital(1);

    const saidas: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void saidas.push(String(m)));
    delete process.env.SMTP_URL;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    let texto = saidas.join("\n");
    expect(texto).toContain(TITULO_DA_SECAO);
    expect(texto.indexOf("Material de limpeza para escolas")).toBeLessThan(texto.indexOf(TITULO_DA_SECAO));
    expect(texto).toContain("https://x.test/orgao/46344354000108");
    expect((await db.query(`select contrato_id from recompra_envios where user_id = $1`, [u])).rows).toEqual([{ contrato_id: primeiro }]);

    // Next day: a new edital, the same contract and one more. Only the new one is in the section.
    const segundo = await contrato(41, { objeto: "Serviço de limpeza predial", orgao_cnpj: "11111111000191", orgao: "PREFEITURA DE SANTOS" });
    await novoEdital(2);
    saidas.length = 0;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    texto = saidas.join("\n");
    expect(texto).toContain("https://x.test/orgao/11111111000191");
    expect(texto).not.toContain("https://x.test/orgao/46344354000108");
    expect((await db.query(`select contrato_id from recompra_envios where user_id = $1 order by 1`, [u])).rows.map((r) => r.contrato_id).sort()).toEqual([primeiro, segundo].sort());

    // A third edital and nothing new to buy again: no section.
    await novoEdital(3);
    saidas.length = 0;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    log.mockRestore();
    expect(saidas.join("\n")).not.toContain(TITULO_DA_SECAO);
  });
});
