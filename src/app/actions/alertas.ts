"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { parseValor } from "@/lib/params";
import { addToPipeline } from "@/lib/pipeline";
import { buildSearch, type EditalResumo } from "@/lib/search";
import { currentUser, requireUser } from "@/lib/session";
import type { FormState } from "./auth";

const MAX_ALERTAS = 20;

function parseAlerta(form: FormData) {
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  const palavras = String(form.get("palavras") ?? form.get("q") ?? "").trim().slice(0, 1000);
  const ufs = form.getAll("uf").map(String).filter((u) => /^[A-Z]{2}$/.test(u));
  const modalidades = form.getAll("modalidade").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const valorMin = parseValor(String(form.get("min") ?? ""));
  const valorMax = parseValor(String(form.get("max") ?? ""));
  return { nome: nome || palavras.split(/[,;\n]/)[0].trim().slice(0, 60), palavras, ufs, modalidades, valorMin, valorMax };
}

async function inserir(userId: number, a: ReturnType<typeof parseAlerta>): Promise<string | null> {
  if (!a.palavras) return "Informe ao menos uma palavra-chave.";
  if (a.valorMin != null && a.valorMax != null && a.valorMin > a.valorMax) return "O valor mínimo é maior que o máximo.";
  const [{ n }] = await query<{ n: string }>(`select count(*) as n from alerts where user_id = $1`, [userId]);
  if (Number(n) >= MAX_ALERTAS) return `Limite de ${MAX_ALERTAS} alertas.`;
  await query(
    `insert into alerts (user_id, nome, palavras, ufs, modalidades, valor_min, valor_max) values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, a.nome, a.palavras, a.ufs, a.modalidades, a.valorMin, a.valorMax],
  );
  revalidatePath("/alertas");
  return null;
}

export async function criarAlerta(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const error = await inserir(user.id, parseAlerta(form));
  return error ? { error } : { ok: "Alerta criado. O primeiro resumo chega no próximo envio diário, às 7h." };
}

/** "Salvar como alerta" from the search page: the current filters arrive as hidden fields. */
export async function salvarBusca(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const error = await inserir(user.id, parseAlerta(form));
  redirect(error ? `/alertas?erro=${encodeURIComponent(error)}` : "/alertas?salvo=1");
}

export type Preview = { total: number; exemplos: EditalLinha[] } | null;

/** How many open editais the alert would match right now, before saving it. */
export async function previewAlerta(_: Preview, form: FormData): Promise<Preview> {
  const a = parseAlerta(form);
  if (!a.palavras) return { total: 0, exemplos: [] };
  const { sql, params } = buildSearch(
    { palavras: a.palavras, ufs: a.ufs, modalidades: a.modalidades, valorMin: a.valorMin, valorMax: a.valorMax, ordem: "recentes" },
    { limit: 5 },
  );
  const rows = await query<EditalResumo>(sql, params);
  return {
    total: Number(rows[0]?.total ?? 0),
    exemplos: rows.map(({ id, objeto, orgao, uf, municipio, modalidade, valor_estimado, encerramento }) => ({
      id, objeto, orgao, uf, municipio, modalidade, valor_estimado, encerramento,
    })),
  };
}

/** Last step of /boas-vindas: the first alert, the editais ticked in its preview go to the pipeline, wizard marked done. */
export async function concluirOnboarding(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const error = await inserir(user.id, parseAlerta(form));
  if (error) return { error };
  const ids = form.getAll("acompanhar").map(String).slice(0, 10);
  const existentes = await query<{ id: string }>(`select id from editais where id = any($1::text[])`, [ids]);
  for (const { id } of existentes) await addToPipeline(pool(), user.id, id);
  await query(`update users set onboarding_em = coalesce(onboarding_em, now()) where id = $1`, [user.id]);
  redirect("/painel?bemvindo=1");
}

export async function pularOnboarding() {
  const user = await requireUser();
  await query(`update users set onboarding_em = coalesce(onboarding_em, now()) where id = $1`, [user.id]);
  redirect("/painel");
}

export async function alternarAlerta(form: FormData) {
  const user = await requireUser();
  await query(`update alerts set ativo = not ativo where id = $1 and user_id = $2`, [Number(form.get("id")), user.id]);
  revalidatePath("/alertas");
}

export async function excluirAlerta(form: FormData) {
  const user = await requireUser();
  await query(`delete from alerts where id = $1 and user_id = $2`, [Number(form.get("id")), user.id]);
  revalidatePath("/alertas");
}
