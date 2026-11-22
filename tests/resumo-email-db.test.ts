// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { montarDigests, prepararResumosDoDigest, sendDigests } from "@/lib/alerts";
import { closePool, pool } from "@/lib/db";
import type { EditalRow } from "@/lib/pncp";
import { reservarVaga, resumoParaEmail } from "@/lib/resumo-email";
import type { Resumo } from "@/lib/summary";

const url = process.env.TEST_DATABASE_URL;

const DADOS: Resumo = {
  objeto: "Aquisição de notebooks para a secretaria.",
  valor_estimado: "R$ 100.000,00",
  prazos: [{ evento: "Limite de propostas", data: "30/11/2026 09:00" }],
  exigencias_habilitacao: [],
  exclusivo_me_epp: false,
  garantia: "não exige",
  criterio_julgamento: "menor preço",
  local_entrega_execucao: "Curitiba/PR",
  pontos_de_atencao: ["Amostra em 3 dias"],
};
const GERADO = { dados: DADOS, documento: "https://pncp.test/edital.pdf", uso: { entrada: 1000, saida: 500 }, modelo: "teste" };

async function novoEdital(id: string, dias: number, objeto = "Aquisição de notebooks para a secretaria") {
  await pool().query(
    `insert into editais (id, cnpj, ano, sequencial, orgao, objeto, modalidade_id, encerramento, publicado_em, raw)
     values ($1, '99000000000009', 2026, $2, 'ORGAO TESTE', $3, 6, now() + make_interval(days => $4), now(), '{}')`,
    [id, Number(id.replace(/\D/g, "").slice(-6)) || 1, objeto, dias],
  );
  return (await pool().query<EditalRow>(`select * from editais where id = $1`, [id])).rows[0];
}

describe.skipIf(!url)("resumo no e-mail (banco)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await pool().query("drop schema public cascade; create schema public;");
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  });
  afterAll(closePool);

  it("uses the cache first, never charges a user, and stops at the global daily cap", async () => {
    const db = pool();
    const gerar = vi.fn().mockResolvedValue(GERADO);
    const a = await novoEdital("99000000000009-1-000001/2026", 6);
    const b = await novoEdital("99000000000009-1-000002/2026", 6);
    const c = await novoEdital("99000000000009-1-000003/2026", 6);

    // Nothing cached: it generates, and the cost lands on the global counter, not on any user.
    expect(await resumoParaEmail(db, a, { teto: 2, gerar })).toEqual(DADOS);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect((await db.query(`select total from resumo_job_uso where dia = current_date`)).rows[0].total).toBe(1);
    expect((await db.query(`select count(*)::int as n from resumo_uso`)).rows[0].n).toBe(0);

    // A cached summary costs nothing: no generation, no slot taken.
    await db.query(`insert into resumos (edital_id, documento, dados, modelo) values ($1, 'x', $2, 'teste')`, [b.id, JSON.stringify(DADOS)]);
    expect(await resumoParaEmail(db, b, { teto: 2, gerar })).toEqual(DADOS);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect((await db.query(`select total from resumo_job_uso where dia = current_date`)).rows[0].total).toBe(1);

    // The cap is global per day: the second new summary fits, the third does not.
    expect(await resumoParaEmail(db, c, { teto: 2, gerar })).toEqual(DADOS);
    const d = await novoEdital("99000000000009-1-000004/2026", 6);
    expect(await resumoParaEmail(db, d, { teto: 2, gerar })).toBeNull();
    expect(gerar).toHaveBeenCalledTimes(2);
    expect((await db.query(`select total from resumo_job_uso where dia = current_date`)).rows[0].total).toBe(2);
    expect(await reservarVaga(db, 0)).toBe(false); // 0 turns the feature off
  });

  it("returns null and gives the slot back when the summary cannot be made", async () => {
    const db = pool();
    const antes = (await db.query(`select coalesce(max(total), 0)::int as n from resumo_job_uso where dia = current_date`)).rows[0].n;
    const falha = vi.fn().mockRejectedValue(new Error("O documento principal não é um PDF"));
    const e = await novoEdital("99000000000009-1-000005/2026", 6);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resumoParaEmail(db, e, { teto: 50, gerar: falha })).toBeNull();
    erro.mockRestore();
    expect((await db.query(`select total from resumo_job_uso where dia = current_date`)).rows[0].total).toBe(antes);
  });

  it("prepares the summaries of the e-mail and sends them in it, without touching a user quota", async () => {
    const db = pool();
    await db.query(`delete from resumos; delete from resumo_job_uso; delete from editais;`);
    const { rows } = await db.query<{ id: number }>(`insert into users (email) values ('digest@teste.com') returning id`);
    await db.query(
      `insert into alerts (user_id, nome, palavras, ufs, modalidades, ativo) values ($1, 'TI', 'notebooks', '{}', '{}', true)`,
      [rows[0].id],
    );
    await novoEdital("99000000000009-1-000101/2026", 1); // too close: no summary
    for (let i = 2; i <= 6; i++) await novoEdital(`99000000000009-1-00010${i}/2026`, i + 3);

    expect((await montarDigests(db)).map((d) => d.email)).toEqual(["digest@teste.com"]);
    process.env.RESUMO_EMAIL_TETO_DIARIO = "10";
    // No Anthropic key and no network here: every generation fails, so nothing is stored and the e-mail still goes out.
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await prepararResumosDoDigest(db, { maxMs: 60_000 });
    erro.mockRestore();
    expect(r.escolhidos).toBe(3);
    expect(r.resumidos).toBe(0);

    // The three chosen editais get a stored summary (as the job would have done); the 7h send reads them.
    const ids = (await db.query<{ id: string }>(`select id from editais where encerramento > now() + interval '3 days' order by encerramento limit 3`)).rows;
    for (const e of ids) await db.query(`insert into resumos (edital_id, documento, dados, modelo) values ($1, 'x', $2, 'teste')`, [e.id, JSON.stringify(DADOS)]);
    const r2 = await prepararResumosDoDigest(db, { maxMs: 60_000 });
    expect(r2).toEqual({ escolhidos: 3, resumidos: 0 }); // already cached: nothing new to generate

    const mails: string[] = [];
    const { sendMail } = await import("@/lib/mail");
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void mails.push(String(m)));
    delete process.env.SMTP_URL;
    expect(await sendDigests(db, "https://x.test")).toBe(1);
    log.mockRestore();
    expect(typeof sendMail).toBe("function");
    const texto = mails.join("\n");
    expect((texto.match(/Resumo por IA \(confira no edital\)/g) ?? []).length).toBe(3);
    expect((await db.query(`select count(*)::int as n from resumo_uso`)).rows[0].n).toBe(0);
    delete process.env.RESUMO_EMAIL_TETO_DIARIO;
  });
});
