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
import { pool, query } from "@/lib/db";
import { ensureDemoUser, seedDemo } from "@/lib/demo";
import { escapeHtml, sendMail } from "@/lib/mail";

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

export async function pedirLink(_: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "E-mail inválido." };

  const recent = await query<{ n: string }>(
    `select count(*) as n from login_tokens t join users u on u.id = t.user_id
     where u.email = $1 and t.expira_em > now() + interval '${LOGIN_TOKEN_MINUTES - 5} minutes'`,
    [email],
  );
  if (Number(recent[0].n) >= 3) return { error: "Já enviamos links há pouco. Confira sua caixa de entrada e o spam." };

  const [user] = await query<{ id: number; demo: boolean }>(
    `insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id, demo`,
    [email],
  );
  if (user.demo) return { error: "Use o botão “Ver demo” para entrar na conta de demonstração." };
  const { token, hash } = newLoginToken();
  await query(`insert into login_tokens (token_hash, user_id, expira_em) values ($1, $2, now() + make_interval(mins => $3))`, [
    hash,
    user.id,
    LOGIN_TOKEN_MINUTES,
  ]);
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/entrar/confirmar?token=${token}`;
  await sendMail({
    to: email,
    subject: "Seu link de acesso ao Radar de Licitações",
    text: `Para entrar, abra: ${url}\n\nO link vale ${LOGIN_TOKEN_MINUTES} minutos. Se não foi você, ignore este e-mail.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18181b">
<p style="font-size:16px;font-weight:600">Entrar no Radar de Licitações</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Entrar</a></p>
<p style="color:#5f5f6b;font-size:13px">O link vale ${LOGIN_TOKEN_MINUTES} minutos e só funciona uma vez. Se não foi você, ignore este e-mail.</p></div>`,
  });
  return { ok: `Enviamos um link para ${email}. Ele vale ${LOGIN_TOKEN_MINUTES} minutos.` };
}

export async function confirmarLogin(form: FormData) {
  const token = String(form.get("token") ?? "");
  // Single use: the UPDATE only matches an unused, unexpired token.
  const rows = token
    ? await query<{ user_id: number; novo: boolean }>(
        `update login_tokens t set usado_em = now() from users u
         where u.id = t.user_id and t.token_hash = $1 and t.usado_em is null and t.expira_em > now()
         returning t.user_id, u.onboarding_em is null as novo`,
        [hashToken(token)],
      )
    : [];
  if (!rows[0]) redirect("/entrar?erro=1");
  await startSession(rows[0].user_id);
  redirect(rows[0].novo ? "/boas-vindas" : "/painel");
}

export async function entrarDemo() {
  const db = pool();
  const userId = await ensureDemoUser(db);
  const { rows } = await db.query(`select 1 from pipeline where user_id = $1 limit 1`, [userId]);
  if (!rows.length) await seedDemo(db);
  await startSession(userId);
  redirect("/painel");
}

export async function sair() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
