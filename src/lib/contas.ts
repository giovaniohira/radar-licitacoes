// Accounts: sign-up with password, e-mail verification, password sign-in (e-mail or CNPJ), magic links and resets.
// No Next.js imports here, so the flows are tested against a real database (tests/contas.test.ts).
// Rules that hold everywhere: responses never say whether an e-mail or CNPJ has an account, passwords never reach a log,
// and only someone who opened a link sent to the address can make an account usable.
import {
  LOGIN_TOKEN_MINUTES,
  RESET_TOKEN_MINUTES,
  VERIFY_TOKEN_MINUTES,
  hashSenha,
  hashToken,
  newLoginToken,
  normalizeCnpj,
  normalizeEmail,
  parseIdentificador,
  problemaSenha,
  verificarSenha,
} from "./auth";
import { EMPRESA } from "./empresa";
import { query } from "./db";
import { escapeHtml, sendMail } from "./mail";

export type TipoToken = "login" | "verificar" | "senha" | "email";

export const LIMITE_FALHAS_CONTA = 5;
export const LIMITE_FALHAS_IP = 30;
export const JANELA_MINUTOS = 15;
/** E-mails (any kind of link) per account in the last 5 minutes, so no form can flood an inbox. */
export const LIMITE_LINKS = 5;

export const ERRO_LOGIN = "E-mail/CNPJ ou senha incorretos.";
export const ERRO_BLOQUEIO = `Muitas tentativas. Espere ${JANELA_MINUTOS} minutos ou entre pelo link no e-mail.`;
export const ERRO_LINKS = "Já enviamos e-mails há pouco. Confira sua caixa de entrada e o spam.";

const MINUTOS: Record<TipoToken, number> = {
  login: LOGIN_TOKEN_MINUTES,
  email: LOGIN_TOKEN_MINUTES,
  verificar: VERIFY_TOKEN_MINUTES,
  senha: RESET_TOKEN_MINUTES,
};

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function validade(min: number): string {
  return min >= 60 ? `${min / 60} ${min === 60 ? "hora" : "horas"}` : `${min} minutos`;
}

async function linksRecentes(userId: number): Promise<number> {
  const [r] = await query<{ n: string }>(`select count(*) as n from login_tokens where user_id = $1 and criado_em > now() - interval '5 minutes'`, [userId]);
  return Number(r.n);
}

interface Conteudo {
  assunto: string;
  titulo: string;
  botao: string;
  /** Plain-text paragraphs, escaped for the HTML part. */
  antes?: string[];
  depois?: string[];
}

function conteudo(tipo: TipoToken, extra: string[] = []): Conteudo {
  const ignore = "Se não foi você, ignore este e-mail.";
  switch (tipo) {
    case "verificar":
      return {
        assunto: "Confirme seu e-mail no Vencedital",
        titulo: "Confirme seu e-mail para terminar o cadastro",
        botao: "Confirmar e-mail",
        antes: extra,
        depois: ["Se você não criou uma conta no Vencedital, ignore este e-mail."],
      };
    case "senha":
      return { assunto: "Crie uma nova senha no Vencedital", titulo: "Criar uma nova senha", botao: "Criar nova senha", depois: [ignore + " Sua senha atual continua valendo."] };
    case "email":
      return { assunto: "Confirme seu novo e-mail no Vencedital", titulo: "Confirmar novo e-mail no Vencedital", botao: "Confirmar e-mail", depois: [ignore] };
    default:
      return { assunto: "Seu link de acesso ao Vencedital", titulo: "Entrar no Vencedital", botao: "Entrar", antes: extra, depois: [ignore] };
  }
}

/** Creates a single-use token and mails its link. Returns false (and sends nothing) when the account hit the e-mail limit. */
export async function enviarToken(userId: number, para: string, tipo: TipoToken, opts: { emailNovo?: string; extra?: string[] } = {}): Promise<boolean> {
  if ((await linksRecentes(userId)) >= LIMITE_LINKS) return false;
  const { token, hash } = newLoginToken();
  const min = MINUTOS[tipo];
  await query(`insert into login_tokens (token_hash, user_id, expira_em, email_novo, tipo) values ($1, $2, now() + make_interval(mins => $3), $4, $5)`, [
    hash,
    userId,
    min,
    opts.emailNovo ?? null,
    tipo,
  ]);
  const caminho = tipo === "senha" ? "/entrar/nova-senha" : "/entrar/confirmar";
  const url = `${appUrl()}${caminho}?token=${token}`;
  const c = conteudo(tipo, opts.extra);
  const vale = `O link vale ${validade(min)} e só funciona uma vez.`;
  const p = (s: string) => `<p style="color:#5f5f6b;font-size:13px">${escapeHtml(s)}</p>`;
  await sendMail({
    to: para,
    subject: c.assunto,
    text: [c.titulo + ":", url, ...(c.antes ?? []), vale, ...(c.depois ?? [])].join("\n\n"),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18181b">
<p style="font-size:16px;font-weight:600">${escapeHtml(c.titulo)}</p>
${(c.antes ?? []).map((s) => `<p>${escapeHtml(s)}</p>`).join("\n")}
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(c.botao)}</a></p>
${p(vale)}
${(c.depois ?? []).map(p).join("\n")}</div>`,
  });
  return true;
}

// --- Lockout ---

async function bloqueado(chaves: { id: string; ip: string | null }): Promise<boolean> {
  const [r] = await query<{ id: string; ip: string }>(
    `select count(*) filter (where chave = $1) as id, count(*) filter (where chave = $2) as ip
     from tentativas_login where chave in ($1, $2) and em > now() - make_interval(mins => $3)`,
    [chaves.id, chaves.ip ? `ip:${chaves.ip}` : "", JANELA_MINUTOS],
  );
  return Number(r.id) >= LIMITE_FALHAS_CONTA || Number(r.ip) >= LIMITE_FALHAS_IP;
}

async function registrarFalha(chaves: { id: string; ip: string | null }) {
  await query(`delete from tentativas_login where em < now() - interval '1 day'`);
  await query(`insert into tentativas_login (chave) values ($1)` + (chaves.ip ? `, ($2)` : ""), chaves.ip ? [chaves.id, `ip:${chaves.ip}`] : [chaves.id]);
}

/** Forms that send e-mail (sign-up, magic link, reset): at most this many per IP per window, across all addresses. */
export const LIMITE_ENVIOS_IP = 20;

/** Counts one e-mail-sending request from this IP; true when the IP is over the limit (then nothing is sent). */
export async function excedeuEnviosIp(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const chave = `envio:${ip}`;
  const [r] = await query<{ n: string }>(`select count(*) as n from tentativas_login where chave = $1 and em > now() - make_interval(mins => $2)`, [chave, JANELA_MINUTOS]);
  if (Number(r.n) >= LIMITE_ENVIOS_IP) return true;
  await query(`insert into tentativas_login (chave) values ($1)`, [chave]);
  return false;
}

// --- Sign-up ---

export type Resposta = { ok?: string; error?: string };

/**
 * Same answer whether or not the address already has an account; what differs is only the e-mail that arrives:
 * a confirmation link for a new (or still unconfirmed) account, a sign-in link for an existing one.
 */
export async function criarConta(dados: { email: string; senha: string }): Promise<Resposta> {
  const email = normalizeEmail(dados.email);
  if (!email) return { error: "E-mail inválido." };
  const problema = problemaSenha(dados.senha);
  if (problema) return { error: problema };
  const resposta = { ok: email };

  const [existente] = await query<{ id: number; verificado: boolean }>(`select id, email_verificado_em is not null as verificado from users where email = $1`, [email]);
  if (existente?.verificado) {
    // Already a customer: never touch the password from here. Mail a sign-in link instead.
    await enviarToken(existente.id, email, "login", {
      extra: ["Você já tem uma conta no Vencedital com este e-mail, então não criamos outra. Entre pelo botão abaixo ou use “Esqueci a senha” na tela de entrar."],
    });
    return resposta;
  }

  const hash = await hashSenha(dados.senha);
  let userId: number;
  try {
    if (existente) {
      // Unconfirmed: whoever opens the newest link wins. Older links stop working, so an earlier link can't confirm this password.
      await query(`update login_tokens set usado_em = now() where user_id = $1 and tipo = 'verificar' and usado_em is null`, [existente.id]);
      await query(`update users set senha_hash = $2 where id = $1`, [existente.id, hash]);
      userId = existente.id;
    } else {
      [{ id: userId }] = await query<{ id: number }>(`insert into users (email, senha_hash) values ($1, $2) returning id`, [email, hash]);
    }
  } catch (err) {
    // A concurrent sign-up took the e-mail between the check and the write: answer the same as always.
    if ((err as { code?: string }).code === "23505") return resposta;
    throw err;
  }
  if (!(await enviarToken(userId, email, "verificar"))) return { error: ERRO_LINKS };
  return resposta;
}

/** "Não recebi": a new confirmation link for an unconfirmed account. Silent for anything else. */
export async function reenviarVerificacao(emailBruto: string): Promise<Resposta> {
  const email = normalizeEmail(emailBruto);
  if (!email) return { error: "E-mail inválido." };
  const [u] = await query<{ id: number }>(`select id from users where email = $1 and email_verificado_em is null and senha_hash is not null`, [email]);
  if (u && !(await enviarToken(u.id, email, "verificar"))) return { error: ERRO_LINKS };
  return { ok: email };
}

// --- Sign-in ---

export type Entrada = { userId: number } | { pendente: string } | { error: string };

/** Password sign-in by e-mail or CNPJ. `pendente` means the password was right but the address is not confirmed yet. */
export async function entrarComSenha(identificador: string, senha: string, ip: string | null): Promise<Entrada> {
  const id = parseIdentificador(identificador);
  if (!id || !senha) return { error: ERRO_LOGIN };
  const chaves = { id: `id:${id.valor}`, ip };
  if (await bloqueado(chaves)) return { error: ERRO_BLOQUEIO };

  const [u] = await query<{ id: number; email: string; senha_hash: string | null; verificado: boolean }>(
    `select id, email, senha_hash, email_verificado_em is not null as verificado from users where ${id.tipo === "email" ? "email" : "cnpj"} = $1`,
    [id.valor],
  );
  if (!(await verificarSenha(senha, u?.senha_hash))) {
    await registrarFalha(chaves);
    return { error: ERRO_LOGIN };
  }
  await query(`delete from tentativas_login where chave = $1`, [chaves.id]);
  if (!u.verificado) {
    await enviarToken(u.id, u.email, "verificar");
    return { pendente: u.email };
  }
  return { userId: u.id };
}

/** Magic link. Like before, an unknown address gets an account, confirmed when the link is opened. */
export async function pedirLinkAcesso(emailBruto: string): Promise<Resposta> {
  const email = normalizeEmail(emailBruto);
  if (!email) return { error: "E-mail inválido." };
  const [user] = await query<{ id: number }>(`insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`, [email]);
  if (!(await enviarToken(user.id, email, "login"))) return { error: ERRO_LINKS };
  return { ok: `Enviamos um link para ${email}. Ele vale ${LOGIN_TOKEN_MINUTES} minutos.` };
}

/** Consumes a sign-in, confirmation or e-mail-change token (never a reset token: that one needs a new password). */
export async function confirmarToken(token: string): Promise<{ userId: number; novo: boolean; emailNovo: string | null; emailTrocado: boolean } | null> {
  if (!token) return null;
  // Single use: the UPDATE only matches an unused, unexpired token.
  const [t] = await query<{ user_id: number; tipo: TipoToken; email_novo: string | null; verificado: boolean }>(
    `update login_tokens t set usado_em = now() from users u
     where u.id = t.user_id and t.token_hash = $1 and t.usado_em is null and t.expira_em > now() and t.tipo in ('login', 'verificar', 'email')
     returning t.user_id, t.tipo, t.email_novo, u.email_verificado_em is not null as verificado`,
    [hashToken(token)],
  );
  if (!t) return null;
  if (t.tipo === "email" && t.email_novo) {
    // The address may have been taken by someone else since the link was sent.
    const ok = await query(`update users set email = $1, email_verificado_em = now() where id = $2 and not exists (select 1 from users where email = $1) returning id`, [
      t.email_novo,
      t.user_id,
    ]).catch(() => []);
    return { userId: t.user_id, novo: false, emailNovo: t.email_novo, emailTrocado: ok.length > 0 };
  }
  // A magic link opened on an account nobody had confirmed proves the inbox, not the password typed at that sign-up
  // (it may have been typed by someone else), so that password is dropped. A confirmation link vouches for it.
  const [u] = await query<{ novo: boolean }>(
    `update users set
       senha_hash = case when email_verificado_em is null and $2 = 'login' then null else senha_hash end,
       email_verificado_em = coalesce(email_verificado_em, now())
     where id = $1 returning onboarding_em is null as novo`,
    [t.user_id, t.tipo],
  );
  return { userId: t.user_id, novo: u.novo, emailNovo: null, emailTrocado: false };
}

// --- Passwords ---

/** "Esqueci a senha": same answer whether or not the e-mail/CNPJ has an account. */
export async function pedirNovaSenha(identificador: string): Promise<Resposta> {
  const id = parseIdentificador(identificador);
  if (!id) return { error: "Digite um e-mail ou CNPJ válido." };
  const [u] = await query<{ id: number; email: string }>(`select id, email from users where ${id.tipo === "email" ? "email" : "cnpj"} = $1`, [id.valor]);
  if (u) await enviarToken(u.id, u.email, "senha");
  return { ok: "Se houver uma conta com esse e-mail ou CNPJ, enviamos um link para criar uma nova senha. Confira também o spam." };
}

/** Is this an unused, unexpired reset token? For the page, before the user types anything. */
export async function tokenSenhaValido(token: string): Promise<boolean> {
  if (!token) return false;
  const r = await query(`select 1 from login_tokens where token_hash = $1 and tipo = 'senha' and usado_em is null and expira_em > now()`, [hashToken(token)]);
  return r.length > 0;
}

/**
 * Sets the password from a reset link. Opening the link proves the inbox, so the address becomes confirmed.
 * Every other session ends: sessions issued before `desde` (epoch seconds, from the app clock) stop working.
 */
export async function redefinirSenha(token: string, senha: string, desde: number): Promise<{ userId: number } | { error: string }> {
  const problema = problemaSenha(senha);
  if (problema) return { error: problema };
  const [t] = token
    ? await query<{ user_id: number }>(
        `update login_tokens set usado_em = now() where token_hash = $1 and tipo = 'senha' and usado_em is null and expira_em > now() returning user_id`,
        [hashToken(token)],
      )
    : [];
  if (!t) return { error: "Esse link expirou ou já foi usado. Peça um novo em “Esqueci a senha”." };
  const hash = await hashSenha(senha);
  await query(`update login_tokens set usado_em = now() where user_id = $1 and tipo = 'senha' and usado_em is null`, [t.user_id]);
  const [u] = await query<{ email: string; cnpj: string | null }>(
    `update users set senha_hash = $2, email_verificado_em = coalesce(email_verificado_em, now()), sessoes_desde = to_timestamp($3) where id = $1 returning email, cnpj`,
    [t.user_id, hash, desde],
  );
  await query(`delete from tentativas_login where chave = any($1::text[])`, [[`id:${u.email}`, u.cnpj ? `id:${u.cnpj}` : ""]]);
  return { userId: t.user_id };
}

/** From /conta. Link-only accounts create their first password without an old one. Ends the other sessions. */
export async function trocarSenha(userId: number, atual: string, nova: string, desde: number): Promise<Resposta> {
  const [u] = await query<{ senha_hash: string | null }>(`select senha_hash from users where id = $1`, [userId]);
  if (!u) return { error: "Conta não encontrada." };
  if (u.senha_hash) {
    const chaves = { id: `conta:${userId}`, ip: null };
    if (await bloqueado(chaves)) return { error: `Muitas tentativas. Espere ${JANELA_MINUTOS} minutos ou use “Esqueci a senha”.` };
    if (!(await verificarSenha(atual, u.senha_hash))) {
      await registrarFalha(chaves);
      return { error: "Senha atual incorreta." };
    }
  }
  const problema = problemaSenha(nova);
  if (problema) return { error: problema };
  await query(`update users set senha_hash = $2, sessoes_desde = to_timestamp($3) where id = $1`, [userId, await hashSenha(nova), desde]);
  return { ok: u.senha_hash ? "Senha trocada. Os outros aparelhos foram desconectados." : "Senha criada. Agora você também entra com e-mail ou CNPJ e senha." };
}

/**
 * Onboarding and /conta: saves the company's CNPJ (enables the CNPJ sign-in). One account per CNPJ: a second person
 * from the same company waits for invitations. Only signed-in, confirmed accounts get here, so saying the CNPJ is
 * taken reveals nothing to an anonymous visitor.
 */
export async function definirCnpj(userId: number, bruto: string): Promise<Resposta & { cnpj?: string }> {
  const cnpj = normalizeCnpj(bruto);
  if (!cnpj) return { error: "CNPJ inválido. Confira os números." };
  const ocupado = {
    error: `Esse CNPJ já tem uma conta no Vencedital. Por enquanto é uma conta por empresa.${EMPRESA.contato ? ` Se a empresa é sua, escreva para ${EMPRESA.contato}.` : ""}`,
  };
  try {
    const r = await query(`update users set cnpj = $2 where id = $1 and not exists (select 1 from users where cnpj = $2 and id <> $1) returning id`, [userId, cnpj]);
    return r.length ? { ok: "CNPJ salvo.", cnpj } : ocupado;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return ocupado;
    throw err;
  }
}