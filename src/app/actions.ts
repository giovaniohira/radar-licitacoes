"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
import { escapeHtml, sendMail } from "@/lib/mail";
import { parseValor } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { ResumoError, getOrCreateResumo, type Resumo } from "@/lib/summary";
import type { EditalRow } from "@/lib/pncp";

export type FormState = { ok?: string; error?: string } | null;

export async function pedirLink(_: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "E-mail inválido." };

  const recent = await query<{ n: string }>(
    `select count(*) as n from login_tokens t join users u on u.id = t.user_id
     where u.email = $1 and t.expira_em > now() + interval '${LOGIN_TOKEN_MINUTES - 5} minutes'`,
    [email],
  );
  if (Number(recent[0].n) >= 3) return { error: "Já enviamos links há pouco. Confira sua caixa de entrada e o spam." };

  const [user] = await query<{ id: number }>(
    `insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email],
  );
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
    html: `<p>Para entrar no Radar de Licitações, clique:</p><p><a href="${escapeHtml(url)}">Entrar</a></p><p style="color:#78716c;font-size:13px">O link vale ${LOGIN_TOKEN_MINUTES} minutos. Se não foi você, ignore este e-mail.</p>`,
  });
  return { ok: `Enviamos um link para ${email}.` };
}

export async function confirmarLogin(form: FormData) {
  const token = String(form.get("token") ?? "");
  // Single use: the UPDATE only matches an unused, unexpired token.
  const rows = token
    ? await query<{ user_id: number }>(
        `update login_tokens set usado_em = now()
         where token_hash = $1 and usado_em is null and expira_em > now()
         returning user_id`,
        [hashToken(token)],
      )
    : [];
  if (!rows[0]) redirect("/entrar?erro=1");
  (await cookies()).set(SESSION_COOKIE, signSession(rows[0].user_id), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect("/painel");
}

export async function sair() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

function parseAlerta(form: FormData) {
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  const palavras = String(form.get("palavras") ?? "").trim().slice(0, 1000);
  const ufs = form.getAll("uf").map(String).filter((u) => /^[A-Z]{2}$/.test(u));
  const modalidades = form.getAll("modalidade").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const valorMin = parseValor(String(form.get("min") ?? ""));
  const valorMax = parseValor(String(form.get("max") ?? ""));
  return { nome, palavras, ufs, modalidades, valorMin, valorMax };
}

export async function criarAlerta(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const a = parseAlerta(form);
  if (!a.palavras) return { error: "Informe ao menos uma palavra-chave." };
  if (a.valorMin != null && a.valorMax != null && a.valorMin > a.valorMax) return { error: "Valor mínimo maior que o máximo." };
  const [{ n }] = await query<{ n: string }>(`select count(*) as n from alerts where user_id = $1`, [user.id]);
  if (Number(n) >= 20) return { error: "Limite de 20 alertas no beta." };
  await query(
    `insert into alerts (user_id, nome, palavras, ufs, modalidades, valor_min, valor_max) values ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, a.nome || a.palavras.split(",")[0].slice(0, 40), a.palavras, a.ufs, a.modalidades, a.valorMin, a.valorMax],
  );
  revalidatePath("/painel");
  return { ok: "Alerta criado. Você recebe o primeiro resumo no próximo envio diário." };
}

export async function alternarAlerta(form: FormData) {
  const user = await requireUser();
  await query(`update alerts set ativo = not ativo where id = $1 and user_id = $2`, [Number(form.get("id")), user.id]);
  revalidatePath("/painel");
}

export async function excluirAlerta(form: FormData) {
  const user = await requireUser();
  await query(`delete from alerts where id = $1 and user_id = $2`, [Number(form.get("id")), user.id]);
  revalidatePath("/painel");
}

const STATUS = new Set(["interesse", "preparando", "enviada", "descartado"]);

export async function acompanhar(form: FormData) {
  const user = await requireUser();
  const editalId = String(form.get("edital"));
  const status = String(form.get("status"));
  if (status === "remover") {
    await query(`delete from acompanhamentos where user_id = $1 and edital_id = $2`, [user.id, editalId]);
  } else if (STATUS.has(status)) {
    await query(
      `insert into acompanhamentos (user_id, edital_id, status) values ($1, $2, $3)
       on conflict (user_id, edital_id) do update set status = excluded.status, atualizado_em = now()`,
      [user.id, editalId, status],
    );
  }
  revalidatePath(`/edital/${encodeURIComponent(editalId)}`);
  revalidatePath("/painel");
}

export type ResumoState = { resumo?: Resumo; documento?: string; error?: string } | null;

export async function resumir(_: ResumoState, form: FormData): Promise<ResumoState> {
  const user = await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Resumo por IA não configurado neste servidor." };
  const [edital] = await query<EditalRow>(`select * from editais where id = $1`, [String(form.get("edital"))]);
  if (!edital) return { error: "Edital não encontrado." };
  try {
    const r = await getOrCreateResumo(pool(), edital, user.id);
    return { resumo: r.dados, documento: r.documento };
  } catch (err) {
    if (err instanceof ResumoError) return { error: err.message };
    console.error(err);
    return { error: "Falha inesperada ao resumir." };
  }
}
