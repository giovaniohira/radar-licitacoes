// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a database that can be wiped.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendDigests } from "@/lib/alerts";
import {
  MAX_OUTRAS,
  apagarCertidao,
  avisosPendentes,
  hojeBR,
  listarCertidoes,
  marcarAvisadas,
  salvarCertidao,
} from "@/lib/certidoes";
import { closePool, pool } from "@/lib/db";

const url = process.env.TEST_DATABASE_URL;
const somar = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

async function novoUsuario(email: string) {
  const { rows } = await pool().query<{ id: number }>(`insert into users (email, onboarding_em) values ($1, now()) returning id`, [email]);
  return rows[0].id;
}

describe.skipIf(!url)("certidões (banco)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await pool().query("drop schema public cascade; create schema public;");
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  });
  afterAll(closePool);

  it("creates, edits and deletes, one row per fixed type and only for the owner", async () => {
    const db = pool();
    const ana = await novoUsuario("ana@teste.com");
    const beto = await novoUsuario("beto@teste.com");

    expect(await salvarCertidao(db, ana, { tipo: "fgts", validaAte: "2026-12-31" })).toBeNull();
    expect(await salvarCertidao(db, ana, { tipo: "fgts", validaAte: "2027-02-15" })).toBeNull(); // same type: edits, no duplicate
    expect((await listarCertidoes(db, ana)).filter((c) => c.tipo === "fgts")).toMatchObject([{ valida_ate: "2027-02-15" }]);

    expect(await salvarCertidao(db, ana, { tipo: "fgts", validaAte: "" })).toMatch(/data/);
    expect(await salvarCertidao(db, ana, { tipo: "x", validaAte: "2026-12-31" })).toMatch(/inválido/);

    // "Outras": free name, several allowed, edited and deleted by id.
    await salvarCertidao(db, ana, { tipo: "outra", nome: " Alvará ", validaAte: "2026-12-01" });
    await salvarCertidao(db, ana, { tipo: "outra", nome: "Registro no CREA", validaAte: "2026-12-02" });
    const outras = (await listarCertidoes(db, ana)).filter((c) => c.tipo === "outra");
    expect(outras.map((c) => c.nome)).toEqual(["Alvará", "Registro no CREA"]);
    expect(await salvarCertidao(db, ana, { id: outras[0].id, tipo: "outra", validaAte: "2027-01-10" })).toBeNull();
    expect((await listarCertidoes(db, ana)).find((c) => c.id === outras[0].id)).toMatchObject({ nome: "Alvará", valida_ate: "2027-01-10" });

    // Another user can neither edit nor delete it.
    expect(await salvarCertidao(db, beto, { id: outras[0].id, tipo: "outra", validaAte: "2030-01-01" })).toMatch(/não encontrada/);
    await apagarCertidao(db, beto, outras[0].id);
    expect(await listarCertidoes(db, beto)).toEqual([]);
    expect((await listarCertidoes(db, ana)).some((c) => c.id === outras[0].id)).toBe(true);

    await apagarCertidao(db, ana, outras[0].id);
    expect((await listarCertidoes(db, ana)).some((c) => c.id === outras[0].id)).toBe(false);

    // The cap on free certificates.
    for (let i = 0; i < MAX_OUTRAS; i++) await salvarCertidao(db, beto, { tipo: "outra", nome: `Doc ${i}`, validaAte: "2027-01-01" });
    expect(await salvarCertidao(db, beto, { tipo: "outra", nome: "Demais", validaAte: "2027-01-01" })).toMatch(/Limite/);

    // Deleting the user deletes the certificates.
    await db.query(`delete from users where id = $1`, [beto]);
    expect((await db.query(`select count(*)::int as n from certidoes where user_id = $1`, [beto])).rows[0].n).toBe(0);
  });

  it("warns on days 7, 3, 1 and 0 and never twice the same day", async () => {
    const db = pool();
    await db.query(`delete from certidoes`);
    const uid = await novoUsuario("carla@teste.com");
    const hoje = hojeBR();
    for (const [tipo, dias] of [["federal", 7], ["fgts", 3], ["trabalhista", 1], ["estadual", 0], ["municipal", 8]] as const) {
      await salvarCertidao(db, uid, { tipo, validaAte: somar(hoje, dias) });
    }
    await salvarCertidao(db, uid, { tipo: "outra", nome: "Vencida", validaAte: somar(hoje, -1) });

    const primeira = await avisosPendentes(db, hoje);
    expect(primeira).toHaveLength(1);
    expect(primeira[0].email).toBe("carla@teste.com");
    expect(primeira[0].certidoes.map((c) => c.tipo).sort()).toEqual(["estadual", "federal", "fgts", "trabalhista"]);

    await marcarAvisadas(db, primeira[0].certidoes.map((c) => c.id), hoje);
    expect(await avisosPendentes(db, hoje)).toEqual([]); // nothing repeats today

    // Tomorrow a different set is due: the 7-day one is now 6, the 3-day one 2, the 1-day one is 0, the 8-day one is 7.
    const amanha = await avisosPendentes(db, somar(hoje, 1));
    expect(amanha[0].certidoes.map((c) => c.tipo).sort()).toEqual(["municipal", "trabalhista"]);
  });

  it("sends the warning on top of the digest, or alone, once a day", async () => {
    const db = pool();
    await db.query(`delete from certidoes; delete from users where email like '%@digest.com'`);
    const hoje = hojeBR();
    const comAlerta = await novoUsuario("com-alerta@digest.com");
    const soCertidao = await novoUsuario("so-certidao@digest.com");
    await db.query(`insert into alerts (user_id, nome, palavras, ufs, modalidades, ativo) values ($1, 'TI', 'notebooks', '{}', '{}', true)`, [comAlerta]);
    await db.query(
      `insert into editais (id, cnpj, ano, sequencial, orgao, objeto, modalidade_id, encerramento, publicado_em, raw)
       values ('99000000000007-1-000001/2026', '99000000000007', 2026, 1, 'ORGAO', 'Aquisição de notebooks', 6, now() + interval '9 days', now(), '{}')`,
    );
    await salvarCertidao(db, comAlerta, { tipo: "fgts", validaAte: somar(hoje, 3) });
    await salvarCertidao(db, soCertidao, { tipo: "trabalhista", validaAte: somar(hoje, 1) });

    const saidas: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void saidas.push(String(m)));
    delete process.env.SMTP_URL;
    expect(await sendDigests(db, "https://x.test")).toBe(2);
    const texto = saidas.join("\n");
    // The digest carries the warning above the edital; the other user gets the short e-mail.
    expect(texto).toContain("para: com-alerta@digest.com");
    expect(texto.indexOf("Sua CRF do FGTS vence em 3 dias.")).toBeLessThan(texto.indexOf("Aquisição de notebooks"));
    expect(texto).toContain("para: so-certidao@digest.com");
    expect(texto).toContain("assunto: Sua CNDT vence amanhã");

    // Running it again the same day sends nothing and repeats no warning.
    saidas.length = 0;
    expect(await sendDigests(db, "https://x.test")).toBe(0);
    log.mockRestore();
    expect(saidas.join("\n")).not.toContain("vence");
  });
});
