"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  LOGIN_TOKEN_MINUTES,
  SESSION_COOKIE,
  SESSION_DAYS,
  hashToken,
  newLoginToken,
  normalizeEmail,
  signSession,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendMail } from "@/lib/mail";
import { requireUser } from "@/lib/session";

export type FormState = { ok?: string; error?: string } | null;

async function startSession(userId: number) {
  (await cookies()).set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

// At most 3 links per account in the last 5 minutes, so the form can't be used to flood an inbox.
async function linksRecentes(userId: number): Promise<number> {
  const [r] = await query<{ n: string }>(
    `select count(*) as n from login_tokens where user_id = $1 and expira_em > now() + interval '${LOGIN_TOKEN_MINUTES - 5} minutes'`,
    [userId],
  );
  return Number(r.n);
}

async function enviarLink(userId: number, para: string, emailNovo: string | null) {
  const { token, hash } = newLoginToken();
  await query(
    `insert into login_tokens (token_hash, user_id, expira_em, email_novo) values ($1, $2, now() + make_interval(mins => $3), $4)`,
    [hash, userId, LOGIN_TOKEN_MINUTES, emailNovo],
  );
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/entrar/confirmar?token=${token}`;
  const titulo = emailNovo ? "Confirmar novo e-mail no Radar de Licitações" : "Entrar no Radar de Licitações";
  const botao = emailNovo ? "Confirmar e-mail" : "Entrar";
  await sendMail({
    to: para,
    subject: emailNovo ? "Confirme seu novo e-mail no Radar de Licitações" : "Seu link de acesso ao Radar de Licitações",
    text: `${titulo}: ${url}

O link vale ${LOGIN_TOKEN_MINUTES} minutos. Se não foi você, ignore este e-mail.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18181b">
<p style="font-size:16px;font-weight:600">${titulo}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${botao}</a></p>
<p style="color:#5f5f6b;font-size:13px">O link vale ${LOGIN_TOKEN_MINUTES} minutos e só funciona uma vez. Se não foi você, ignore este e-mail.</p></div>`,
  });
}

export async function pedirLink(_: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "E-mail inválido." };

  const [user] = await query<{ id: number }>(
    `insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email],
  );
  if ((await linksRecentes(user.id)) >= 3) return { error: "Já enviamos links há pouco. Confira sua caixa de entrada e o spam." };
  await enviarLink(user.id, email, null);
  return { ok: `Enviamos um link para ${email}. Ele vale ${LOGIN_TOKEN_MINUTES} minutos.` };
}

export async function confirmarLogin(form: FormData) {
  const token = String(form.get("token") ?? "");
  // Single use: the UPDATE only matches an unused, unexpired token.
  const rows = token
    ? await query<{ user_id: number; novo: boolean; email_novo: string | null }>(
        `update login_tokens t set usado_em = now() from users u
         where u.id = t.user_id and t.token_hash = $1 and t.usado_em is null and t.expira_em > now()
         returning t.user_id, u.onboarding_em is null as novo, t.email_novo`,
        [hashToken(token)],
      )
    : [];
  if (!rows[0]) redirect("/entrar?erro=1");
  const { user_id, novo, email_novo } = rows[0];
  if (email_novo) {
    // The address may have been taken by someone else since the link was sent.
    const ok = await query(`update users set email = $1 where id = $2 and not exists (select 1 from users where email = $1) returning id`, [
      email_novo,
      user_id,
    ]).catch(() => []);
    await startSession(user_id);
    redirect(ok.length ? "/conta?ok=email" : "/conta?erro=email");
  }
  await startSession(user_id);
  redirect(novo ? "/boas-vindas" : "/painel");
}

export async function trocarEmail(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "E-mail inválido." };
  if (email === user.email) return { error: "Esse já é o seu e-mail." };
  if ((await query(`select 1 from users where email = $1`, [email])).length) return { error: "Esse e-mail já tem uma conta no Radar." };
  if ((await linksRecentes(user.id)) >= 3) return { error: "Já enviamos links há pouco. Tente de novo em alguns minutos." };
  await enviarLink(user.id, email, email);
  return { ok: `Enviamos um link para ${email}. A troca só vale depois que você abrir o link.` };
}

export async function sairDeTodos() {
  const user = await requireUser();
  await query(`update users set sessoes_desde = now() where id = $1`, [user.id]);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/entrar");
}

export async function excluirConta(form: FormData) {
  const user = await requireUser();
  if (form.get("confirmar") !== "on") redirect("/conta");
  // Cascades to alerts, pipeline, checklist, notes and login tokens.
  await query(`delete from users where id = $1`, [user.id]);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
