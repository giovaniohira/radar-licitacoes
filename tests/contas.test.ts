// Account flows against a real Postgres (TEST_DATABASE_URL, wiped). E-mails are captured instead of sent.
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mail } from "@/lib/mail";

const enviados: Mail[] = [];
vi.mock("@/lib/mail", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail")>()),
  sendMail: async (m: Mail) => void enviados.push(m),
}));

const { closePool, pool } = await import("@/lib/db");
const c = await import("@/lib/contas");

const url = process.env.TEST_DATABASE_URL;
const CNPJ = "68.631.511/0001-45";
const CNPJ2 = "12.ABC.345/01DE-35";
const SENHA = "uma senha boa";

function ultimoToken(para?: string): string {
  const m = [...enviados].reverse().find((e) => !para || e.to === para);
  const t = m?.text.match(/token=([\w-]+)/)?.[1];
  if (!t) throw new Error("nenhum link enviado");
  return t;
}

async function user(email: string) {
  const r = await pool().query(`select id, senha_hash, cnpj, email_verificado_em, sessoes_desde from users where email = $1`, [email]);
  return r.rows[0];
}

async function contaConfirmada(email: string) {
  expect(await c.criarConta({ email, senha: SENHA })).toEqual({ ok: email });
  return (await c.confirmarToken(ultimoToken(email)))!;
}

describe.skipIf(!url)("contas", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const db = pool();
    await db.query("drop schema public cascade; create schema public;");
    // Apply up to 005 by hand, add accounts as they exist in production today, then let migrate() run 006 on top.
    const dir = new URL("../db/migrations/", import.meta.url);
    await db.query("create table schema_migrations (nome text primary key, aplicado_em timestamptz default now())");
    for (const f of readdirSync(dir).filter((f) => f < "006").sort()) {
      await db.query(readFileSync(new URL(f, dir), "utf8"));
      await db.query("insert into schema_migrations (nome) values ($1)", [f]);
    }
    const legado = await db.query(`insert into users (email) values ('usou@link.com'), ('nunca@abriu.com') returning id`);
    await db.query(`insert into login_tokens (token_hash, user_id, expira_em, usado_em) values ('h1', $1, now(), now() - interval '3 days'), ('h2', $2, now(), null)`, [
      legado.rows[0].id,
      legado.rows[1].id,
    ]);
    const { migrate } = await import("../scripts/migrate");
    expect(await migrate()).toEqual(readdirSync(dir).filter((f) => f >= "006").sort());
  });
  afterAll(closePool);
  beforeEach(async () => {
    enviados.length = 0;
    await pool().query("delete from tentativas_login");
    await pool().query("delete from login_tokens where criado_em > now() - interval '1 hour' and tipo <> 'email'");
  });

  it("keeps legacy accounts: verified if they ever opened a link, no password", async () => {
    expect((await user("usou@link.com")).email_verificado_em).not.toBeNull();
    expect((await user("nunca@abriu.com")).email_verificado_em).toBeNull();
    expect((await user("usou@link.com")).senha_hash).toBeNull();
  });

  it("signs up with e-mail and password, asks for the e-mail, takes the CNPJ in onboarding, then signs in by either", async () => {
    expect(await c.criarConta({ email: " Nova@Empresa.com.br ", senha: SENHA })).toEqual({ ok: "nova@empresa.com.br" });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].subject).toMatch(/Confirme seu e-mail/);
    expect(enviados[0].text).not.toContain(SENHA);
    const u = await user("nova@empresa.com.br");
    expect(u.cnpj).toBeNull();
    expect(u.senha_hash).toMatch(/^scrypt\$/);

    // Right password before confirming: no session, a fresh confirmation link instead.
    expect(await c.entrarComSenha("nova@empresa.com.br", SENHA, "1.1.1.1")).toEqual({ pendente: "nova@empresa.com.br" });
    expect(enviados).toHaveLength(2);

    const ok = await c.confirmarToken(ultimoToken());
    expect(ok).toEqual({ userId: u.id, novo: true, emailNovo: null, emailTrocado: false });
    expect(await c.confirmarToken(ultimoToken())).toBeNull(); // single use
    expect(await c.entrarComSenha("NOVA@empresa.com.br", SENHA, "1.1.1.1")).toEqual({ userId: u.id });
    expect(await c.entrarComSenha(CNPJ, SENHA, "1.1.1.1")).toEqual({ error: c.ERRO_LOGIN }); // no CNPJ yet
    expect(await c.definirCnpj(u.id, CNPJ)).toEqual({ ok: "CNPJ salvo.", cnpj: "68631511000145" });
    expect(await c.entrarComSenha("68631511000145", SENHA, "1.1.1.1")).toEqual({ userId: u.id });
    expect(await c.entrarComSenha(CNPJ, SENHA, "1.1.1.1")).toEqual({ userId: u.id });
  });

  it("gives the same answer for a wrong password, an unknown account and a link-only account", async () => {
    const a = await c.entrarComSenha("nova@empresa.com.br", "senha errada", "2.2.2.2");
    const b = await c.entrarComSenha("ninguem@empresa.com.br", SENHA, "2.2.2.2");
    const d = await c.entrarComSenha("usou@link.com", SENHA, "2.2.2.2");
    const e = await c.entrarComSenha("33.000.167/0001-01", SENHA, "2.2.2.2");
    expect(new Set([a, b, d, e].map((r) => JSON.stringify(r)))).toEqual(new Set([JSON.stringify({ error: c.ERRO_LOGIN })]));
  });

  it("does not create a second account or touch the password when the e-mail is taken", async () => {
    const antes = await user("nova@empresa.com.br");
    expect(await c.criarConta({ email: "nova@empresa.com.br", senha: "outra senha qualquer" })).toEqual({ ok: "nova@empresa.com.br" });
    expect(enviados[0].subject).toBe("Seu link de acesso ao Vencedital");
    expect(enviados[0].text).toMatch(/já tem uma conta/);
    const depois = await user("nova@empresa.com.br");
    expect(depois.senha_hash).toBe(antes.senha_hash);
    expect(depois.cnpj).toBe(antes.cnpj);
  });

  it("keeps one account per CNPJ", async () => {
    const { userId } = await contaConfirmada("outro@empresa.com.br");
    expect((await c.definirCnpj(userId, CNPJ)).error).toBe(c.ERRO_CNPJ_USADO);
    expect(await c.cnpjDeOutraConta(userId, "68631511000145")).toBe(true);
    expect(await c.cnpjDeOutraConta(userId, "06990590000123")).toBe(false);
    expect((await user("outro@empresa.com.br")).cnpj).toBeNull();
    expect(await c.definirCnpj(userId, CNPJ2)).toEqual({ ok: "CNPJ salvo.", cnpj: "12ABC34501DE35" });
    expect((await c.definirCnpj(userId, "12.345.678/0001-00")).error).toMatch(/não existe/);
  });

  it("validates input before anything else", async () => {
    expect(await c.criarConta({ email: "x", senha: SENHA })).toEqual({ error: "Confira o e-mail: falta o @.", campo: "email" });
    expect(await c.criarConta({ email: "compras@padaria", senha: SENHA })).toEqual({ error: "Confira o e-mail: falta o final, como .com.br.", campo: "email" });
    expect(await c.criarConta({ email: "a@b.com", senha: "curta" })).toMatchObject({ campo: "senha" });
    expect((await c.criarConta({ email: "a@b.com", senha: "curta" })).error).toMatch(/8 caracteres/);
    expect(enviados).toHaveLength(0);
  });

  it("lets a later sign-up replace an unconfirmed one; only the newest link confirms", async () => {
    await c.criarConta({ email: "disputa@empresa.com.br", senha: "senha do primeiro" });
    const primeiro = ultimoToken();
    await c.criarConta({ email: "disputa@empresa.com.br", senha: "senha do segundo" });
    expect(await c.confirmarToken(primeiro)).toBeNull();
    expect(await c.confirmarToken(ultimoToken())).not.toBeNull();
    expect((await c.entrarComSenha("disputa@empresa.com.br", "senha do primeiro", null)).hasOwnProperty("error")).toBe(true);
    expect(await c.entrarComSenha("disputa@empresa.com.br", "senha do segundo", null)).toHaveProperty("userId");
  });

  it("drops a password typed at an unconfirmed sign-up when the inbox owner comes in by magic link", async () => {
    await c.criarConta({ email: "vitima@empresa.com.br", senha: "senha de um estranho" });
    expect((await c.pedirLinkAcesso("vitima@empresa.com.br"))).toEqual({ ok: c.OK_LINK });
    expect(await c.confirmarToken(ultimoToken())).toHaveProperty("novo", true);
    const u = await user("vitima@empresa.com.br");
    expect(u.senha_hash).toBeNull();
    expect(u.email_verificado_em).not.toBeNull();
  });

  it("locks an account after 5 failures, even for the right password, and counts per IP too", async () => {
    for (let i = 0; i < c.LIMITE_FALHAS_CONTA; i++) await c.entrarComSenha("nova@empresa.com.br", `errada ${i}`, `9.9.9.${i}`);
    const bloqueio = await c.entrarComSenha("nova@empresa.com.br", SENHA, "8.8.8.8");
    expect(bloqueio).toMatchObject({ error: c.ERRO_BLOQUEIO });
    // Opens when the 5th most recent failure leaves the 15-minute window: just under 15 minutes from now.
    expect((bloqueio as { espera: number }).espera).toBeGreaterThan(14 * 60);
    expect((bloqueio as { espera: number }).espera).toBeLessThanOrEqual(15 * 60);
    expect(await c.entrarComSenha(CNPJ, SENHA, "8.8.8.8")).toHaveProperty("userId"); // separate key: e-mail vs CNPJ
    await pool().query("delete from tentativas_login");
    for (let i = 0; i < c.LIMITE_FALHAS_IP; i++) await c.entrarComSenha(`alvo${i}@empresa.com.br`, "errada", "7.7.7.7");
    expect(await c.entrarComSenha("nova@empresa.com.br", SENHA, "7.7.7.7")).toMatchObject({ error: c.ERRO_BLOQUEIO });
    expect(await c.entrarComSenha("nova@empresa.com.br", SENHA, "6.6.6.6")).toHaveProperty("userId");
  });

  it("resets the password by e-mail or CNPJ, ends other sessions, and the link works once", async () => {
    const unknown = await c.pedirNovaSenha("ninguem@empresa.com.br");
    expect(enviados).toHaveLength(0);
    const known = await c.pedirNovaSenha(CNPJ);
    expect(known).toEqual(unknown);
    expect(enviados[0].to).toBe("nova@empresa.com.br");
    expect(enviados[0].text).toContain("/entrar/nova-senha?token=");
    const token = ultimoToken();
    expect(await c.tokenSenhaValido(token)).toBe("nova@empresa.com.br");
    expect(await c.confirmarToken(token)).toBeNull(); // a reset link never signs in by itself

    const desde = Math.floor(Date.now() / 1000);
    expect((await c.redefinirSenha(token, "curta", desde)).hasOwnProperty("error")).toBe(true);
    expect(await c.tokenSenhaValido(token)).toBe("nova@empresa.com.br"); // a rejected password does not burn the link
    const r = await c.redefinirSenha(token, "senha novinha 2026", desde);
    expect(r).toHaveProperty("userId");
    expect(await c.redefinirSenha(token, "outra senha nova", desde)).toHaveProperty("error");
    expect(await c.entrarComSenha("nova@empresa.com.br", SENHA, null)).toEqual({ error: c.ERRO_LOGIN });
    expect(await c.entrarComSenha("nova@empresa.com.br", "senha novinha 2026", null)).toHaveProperty("userId");
    expect(Math.floor((await user("nova@empresa.com.br")).sessoes_desde.getTime() / 1000)).toBe(desde);
  });

  it("sends the magic link by CNPJ to the account's e-mail, and nothing for an unknown CNPJ", async () => {
    expect(await c.pedirLinkAcesso(CNPJ)).toEqual({ ok: c.OK_LINK });
    expect(enviados.map((m) => m.to)).toEqual(["nova@empresa.com.br"]);
    expect(await c.pedirLinkAcesso("33.000.167/0001-01")).toEqual({ ok: c.OK_LINK });
    expect(enviados).toHaveLength(1);
    expect((await c.pedirLinkAcesso("33.000.167/0001-00")).error).toBeTruthy();
  });

  it("reads the supplier's history from the PNCP contracts", async () => {
    const db = pool();
    const ins = (id: string, uf: string, objeto: string) =>
      db.query(`insert into contratos (id, orgao_cnpj, orgao, uf, fornecedor_ni, objeto, raw) values ($1, '1', 'Órgão', $2, '11222333000181', $3, '{}')`, [id, uf, objeto]);
    await ins("c1", "RO", "Aquisição de gêneros alimentícios para merenda escolar");
    await ins("c2", "AM", "Fornecimento de pães e gêneros alimentícios");
    await ins("c3", "RO", "Merenda escolar: pães e bolos");
    expect(await c.historicoFornecedor("11222333000181")).toEqual({
      ufs: ["RO", "AM"],
      objetos: expect.arrayContaining(["Merenda escolar: pães e bolos"]),
    });
    expect(await c.historicoFornecedor("06990590000123")).toEqual({ ufs: [], objetos: [] });
  });

  it("does not accept a sign-in link as a reset link", async () => {
    await c.pedirLinkAcesso("nova@empresa.com.br");
    expect(await c.redefinirSenha(ultimoToken(), "senha qualquer 1", 0)).toHaveProperty("error");
  });

  it("caps e-mails per account in 5 minutes", async () => {
    for (let i = 0; i < c.LIMITE_LINKS; i++) expect(await c.pedirLinkAcesso("usou@link.com")).toHaveProperty("ok");
    expect(await c.pedirLinkAcesso("usou@link.com")).toEqual({ error: c.ERRO_LINKS });
    expect(await c.pedirNovaSenha("usou@link.com")).toHaveProperty("ok"); // same answer, nothing sent
    expect(enviados).toHaveLength(c.LIMITE_LINKS);
  });

  it("limits e-mail-sending forms per IP", async () => {
    for (let i = 0; i < c.LIMITE_ENVIOS_IP; i++) expect(await c.excedeuEnviosIp("5.5.5.5")).toBe(false);
    expect(await c.excedeuEnviosIp("5.5.5.5")).toBe(true);
    expect(await c.excedeuEnviosIp("5.5.5.6")).toBe(false);
  });

  it("lets a link-only account create a password, then asks for it to change", async () => {
    const { id } = await user("usou@link.com");
    const desde = Math.floor(Date.now() / 1000);
    expect((await c.trocarSenha(id, "", "minha primeira senha", desde)).ok).toMatch(/Senha criada/);
    expect(await c.entrarComSenha("usou@link.com", "minha primeira senha", null)).toEqual({ userId: id });
    expect(await c.trocarSenha(id, "errada", "outra senha boa", desde)).toEqual({ error: "Senha atual incorreta." });
    expect((await c.trocarSenha(id, "minha primeira senha", "outra senha boa", desde)).ok).toMatch(/Senha trocada/);
  });

  it("adds a CNPJ to a legacy account unless another account holds it", async () => {
    const { id } = await user("usou@link.com");
    expect((await c.definirCnpj(id, CNPJ)).error).toMatch(/já tem uma conta/);
    expect(await c.definirCnpj(id, "06.990.590/0001-23")).toEqual({ ok: "CNPJ salvo.", cnpj: "06990590000123" });
    expect(await c.definirCnpj(id, "06990590000123")).toEqual({ ok: "CNPJ salvo.", cnpj: "06990590000123" }); // saving again is fine
    expect(await c.entrarComSenha("06990590000123", "outra senha boa", null)).toEqual({ userId: id });
  });
});
