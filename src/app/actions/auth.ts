"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, normalizeEmail, signSession } from "@/lib/auth";
import * as contas from "@/lib/contas";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type FormState = { ok?: string; error?: string } | null;
/** Password sign-in: `pendente` is the address that still has to be confirmed. */
export type EntrarState = { error?: string; pendente?: string; identificador?: string } | null;

async function startSession(userId: number, now = Date.now()) {
  (await cookies()).set(SESSION_COOKIE, signSession(userId, now), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/** Client address as set by nginx (X-Real-IP); the app port is only reachable through it. */
async function ip(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
}

const ERRO_ENVIOS = "Muitos pedidos deste endereço. Tente de novo em 15 minutos.";
const campo = (form: FormData, nome: string) => String(form.get(nome) ?? "");

async function destino(userId: number): Promise<string> {
  const [u] = await query<{ novo: boolean }>(`select onboarding_em is null as novo from users where id = $1`, [userId]);
  return u?.novo ? "/boas-vindas" : "/painel";
}

export async function criarConta(_: FormState, form: FormData): Promise<FormState> {
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  return contas.criarConta({ email: campo(form, "email"), senha: campo(form, "senha"), cnpj: campo(form, "cnpj") });
}

export async function reenviarVerificacao(_: FormState, form: FormData): Promise<FormState> {
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  const r = await contas.reenviarVerificacao(campo(form, "email"));
  return r.error ? r : { ok: "Enviamos de novo. Pode levar um minuto; confira também o spam." };
}

export async function entrar(_: EntrarState, form: FormData): Promise<EntrarState> {
  const identificador = campo(form, "identificador");
  const r = await contas.entrarComSenha(identificador, campo(form, "senha"), await ip());
  if ("error" in r) return { error: r.error, identificador };
  if ("pendente" in r) return { pendente: r.pendente };
  await startSession(r.userId);
  redirect(await destino(r.userId));
}

export async function pedirLink(_: FormState, form: FormData): Promise<FormState> {
  if (!normalizeEmail(campo(form, "email"))) return { error: "E-mail inválido." };
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  return contas.pedirLinkAcesso(campo(form, "email"));
}

export async function confirmarLogin(form: FormData) {
  const r = await contas.confirmarToken(campo(form, "token"));
  if (!r) redirect("/entrar?erro=1");
  await startSession(r.userId);
  if (r.emailNovo) redirect(r.emailTrocado ? "/conta?ok=email" : "/conta?erro=email");
  redirect(r.novo ? "/boas-vindas" : "/painel");
}

export async function esqueciSenha(_: FormState, form: FormData): Promise<FormState> {
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  return contas.pedirNovaSenha(campo(form, "identificador"));
}

export async function novaSenha(_: FormState, form: FormData): Promise<FormState> {
  const now = Date.now();
  const r = await contas.redefinirSenha(campo(form, "token"), campo(form, "senha"), Math.floor(now / 1000));
  if ("error" in r) return r;
  await startSession(r.userId, now);
  redirect(await destino(r.userId));
}

export async function trocarSenha(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const now = Date.now();
  const r = await contas.trocarSenha(user.id, campo(form, "atual"), campo(form, "nova"), Math.floor(now / 1000));
  // Other devices were signed out; this one gets a fresh session past the cutoff.
  if (r.ok) await startSession(user.id, now);
  return r;
}

export async function salvarCnpj(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  return contas.definirCnpj(user.id, campo(form, "cnpj"));
}

export async function trocarEmail(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const email = normalizeEmail(campo(form, "email"));
  if (!email) return { error: "E-mail inválido." };
  if (email === user.email) return { error: "Esse já é o seu e-mail." };
  if ((await query(`select 1 from users where email = $1`, [email])).length) return { error: "Esse e-mail já tem uma conta no Vencedital." };
  if (!(await contas.enviarToken(user.id, email, "email", { emailNovo: email }))) return { error: "Já enviamos links há pouco. Tente de novo em alguns minutos." };
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
  // Cascades to alerts, pipeline, checklist, notes and login tokens. Failed sign-ins are keyed by e-mail/CNPJ, so they go too.
  const [u] = await query<{ email: string; cnpj: string | null }>(`delete from users where id = $1 returning email, cnpj`, [user.id]);
  if (u) await query(`delete from tentativas_login where chave = any($1::text[])`, [[`id:${u.email}`, `id:${u.cnpj}`]]);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
