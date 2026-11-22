"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, formatCnpj, normalizeCnpj, normalizeEmail, signSession } from "@/lib/auth";
import { consultarCnpj, formatCnae, palavrasDoHistorico, setoresSugeridos } from "@/lib/cnpj-publico";
import * as contas from "@/lib/contas";
import { query } from "@/lib/db";
import { currentUser, requireUser } from "@/lib/session";

export type FormState = { ok?: string; error?: string; campo?: "email" | "senha" } | null;
/** Password sign-in. `ate`: when a lockout ends (epoch ms). */
export type EntrarState = { error?: string; identificador?: string; ate?: number } | null;
/** Resend on /criar-conta/confirme. `ate`: when the next resend is allowed (epoch ms). */
export type ReenvioState = { ok?: string; error?: string; ate?: number } | null;
const ESPERA_REENVIO_MS = 60_000;

/** The address waiting for its confirmation link, read by /criar-conta/confirme. Not a secret: it is the visitor's own e-mail. */
const PENDENTE_COOKIE = "radar_confirmar";

async function startSession(userId: number, now = Date.now()) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(userId, now), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  jar.delete(PENDENTE_COOKIE);
}

async function aguardarConfirmacao(email: string): Promise<never> {
  (await cookies()).set(PENDENTE_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 86400,
  });
  redirect("/criar-conta/confirme");
}

/** The e-mail shown on /criar-conta/confirme, or null when nobody is waiting in this browser. */
export async function emailPendente(): Promise<string | null> {
  return normalizeEmail((await cookies()).get(PENDENTE_COOKIE)?.value ?? "");
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
  const r = await contas.criarConta({ email: campo(form, "email"), senha: campo(form, "senha") });
  if (!r.ok) return r;
  return aguardarConfirmacao(r.ok);
}

export async function reenviarVerificacao(): Promise<ReenvioState> {
  const email = await emailPendente();
  if (!email) return { error: "Não achamos o cadastro. Crie a conta de novo." };
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  const r = await contas.reenviarVerificacao(email);
  return r.error ? r : { ok: "Enviamos um link novo. Pode levar um minuto.", ate: Date.now() + ESPERA_REENVIO_MS };
}

/** Polled by /criar-conta/confirme: true once the link was opened in this browser (the session cookie is set). */
export async function confirmouNesteNavegador(): Promise<boolean> {
  return (await currentUser()) !== null;
}

export async function entrar(_: EntrarState, form: FormData): Promise<EntrarState> {
  const identificador = campo(form, "identificador");
  const r = await contas.entrarComSenha(identificador, campo(form, "senha"), await ip());
  if ("error" in r) return { error: r.error, identificador, ate: r.espera ? Date.now() + r.espera * 1000 : undefined };
  if ("pendente" in r) return aguardarConfirmacao(r.pendente);
  await startSession(r.userId);
  redirect(await destino(r.userId));
}

export async function pedirLink(_: FormState, form: FormData): Promise<FormState> {
  if (await contas.excedeuEnviosIp(await ip())) return { error: ERRO_ENVIOS };
  return contas.pedirLinkAcesso(campo(form, "identificador"));
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
  const r = await contas.definirCnpj(user.id, campo(form, "cnpj"));
  return r.error ? { error: r.error } : { ok: r.ok };
}

export interface Empresa {
  cnpj: string;
  razaoSocial: string | null;
  municipio: string | null;
  uf: string | null;
  abertura: number | null;
  atividade: string | null;
  /** Onboarding sectors matched by CNAE. */
  setores: string[];
  /** States where the company already signed contracts on the PNCP, most first. */
  ufsContratos: string[];
  /** Words from the objects of those contracts. */
  palavras: string[];
  /** The Receita lookup failed or timed out: the onboarding goes on without pre-filling. */
  semCadastro: boolean;
}
export type ConsultaEmpresa = { empresa: Empresa } | { error: string; campo?: "cnpj" } | null;

/** Onboarding step 1: checks the CNPJ and reads what is public about it. Saves nothing (see confirmarEmpresa). */
export async function consultarEmpresa(bruto: string): Promise<ConsultaEmpresa> {
  const user = await requireUser();
  const cnpj = normalizeCnpj(bruto);
  if (!cnpj) return { error: "Este CNPJ não existe. Confira os números.", campo: "cnpj" };
  if (await contas.cnpjDeOutraConta(user.id, cnpj)) return { error: contas.ERRO_CNPJ_USADO };
  const [dados, historico] = await Promise.all([consultarCnpj(cnpj), contas.historicoFornecedor(cnpj)]);
  const palavras = palavrasDoHistorico(historico.objetos);
  return {
    empresa: {
      cnpj: formatCnpj(cnpj),
      razaoSocial: dados?.razaoSocial || null,
      municipio: dados?.municipio ?? null,
      uf: dados?.uf ?? null,
      abertura: dados?.abertura ?? null,
      atividade: dados?.atividade ? `${dados.atividade}${dados.cnaes[0] ? ` (CNAE ${formatCnae(dados.cnaes[0])})` : ""}` : null,
      setores: setoresSugeridos(dados?.cnaes ?? [], palavrasDoHistorico(historico.objetos, 8)),
      ufsContratos: historico.ufs.filter((u) => u !== dados?.uf),
      palavras,
      semCadastro: !dados,
    },
  };
}

/** "Sim, é esta empresa": saves the CNPJ (one account per CNPJ). */
export async function confirmarEmpresa(cnpj: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const r = await contas.definirCnpj(user.id, cnpj);
  return r.error ? { error: r.error } : {};
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
