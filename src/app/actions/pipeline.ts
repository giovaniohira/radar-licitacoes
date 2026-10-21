"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool, query } from "@/lib/db";
import { parseValor } from "@/lib/params";
import { ETAPA_IDS, addToPipeline, cardDetalhe, moveCard, seedChecklist, type CardDetalhe, type Etapa } from "@/lib/pipeline";
import { currentUser, requireUser } from "@/lib/session";

const refresh = (editalId?: string) => {
  revalidatePath("/pipeline");
  revalidatePath("/painel");
  if (editalId) revalidatePath(`/edital/${encodeURIComponent(editalId)}`);
};

export async function adicionarAoPipeline(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const editalId = String(form.get("edital") ?? "");
  const etapa = String(form.get("etapa") ?? "triagem");
  const [existe] = await query(`select 1 from editais where id = $1`, [editalId]);
  if (!existe || !ETAPA_IDS.has(etapa)) return;
  await addToPipeline(pool(), user.id, editalId, etapa as Etapa);
  refresh(editalId);
}

export async function mudarEtapa(form: FormData) {
  const user = await requireUser();
  const editalId = String(form.get("edital") ?? "");
  const etapa = String(form.get("etapa") ?? "");
  if (!ETAPA_IDS.has(etapa)) return;
  const ordem = (await query<{ edital_id: string }>(
    `select edital_id from pipeline where user_id = $1 and etapa = $2 order by posicao`,
    [user.id, etapa],
  )).map((r) => r.edital_id);
  await moveCard(pool(), user.id, editalId, etapa as Etapa, ordem.filter((id) => id !== editalId));
  refresh(editalId);
}

/** Drag-and-drop: the client sends the target column's full order after the drop. */
export async function moverCard(editalId: string, etapa: string, ordem: string[]) {
  const user = await requireUser();
  if (!ETAPA_IDS.has(etapa) || !Array.isArray(ordem) || ordem.length > 500) return;
  await moveCard(pool(), user.id, editalId, etapa as Etapa, ordem.map(String));
  refresh();
}

export async function removerDoPipeline(form: FormData) {
  const user = await requireUser();
  const editalId = String(form.get("edital") ?? "");
  await query(`delete from pipeline where user_id = $1 and edital_id = $2`, [user.id, editalId]);
  refresh(editalId);
}

export async function detalheCard(editalId: string): Promise<CardDetalhe> {
  const user = await requireUser();
  return cardDetalhe(pool(), user.id, editalId);
}

export async function addChecklist(editalId: string, texto: string): Promise<CardDetalhe> {
  const user = await requireUser();
  const t = texto.trim().slice(0, 500);
  if (t) {
    await query(
      `insert into pipeline_checklist (user_id, edital_id, texto, ordem)
       select $1, $2, $3, coalesce(max(ordem) + 1, 1) from pipeline_checklist where user_id = $1 and edital_id = $2`,
      [user.id, editalId, t],
    );
  }
  refresh();
  return cardDetalhe(pool(), user.id, editalId);
}

export async function importarChecklistIA(editalId: string): Promise<CardDetalhe> {
  const user = await requireUser();
  await seedChecklist(pool(), user.id, editalId);
  refresh();
  return cardDetalhe(pool(), user.id, editalId);
}

export async function toggleChecklist(editalId: string, id: number, feito: boolean): Promise<void> {
  const user = await requireUser();
  await query(`update pipeline_checklist set feito = $3 where id = $1 and user_id = $2`, [id, user.id, feito]);
  refresh();
}

export async function removerChecklist(editalId: string, id: number): Promise<CardDetalhe> {
  const user = await requireUser();
  await query(`delete from pipeline_checklist where id = $1 and user_id = $2`, [id, user.id]);
  refresh();
  return cardDetalhe(pool(), user.id, editalId);
}

export async function addNota(editalId: string, texto: string): Promise<CardDetalhe> {
  const user = await requireUser();
  const t = texto.trim().slice(0, 4000);
  if (t) await query(`insert into pipeline_notas (user_id, edital_id, texto) values ($1, $2, $3)`, [user.id, editalId, t]);
  return cardDetalhe(pool(), user.id, editalId);
}

export async function definirValorProposta(editalId: string, valor: string): Promise<void> {
  const user = await requireUser();
  await query(`update pipeline set valor_proposta = $3, atualizado_em = now() where user_id = $1 and edital_id = $2`, [
    user.id,
    editalId,
    parseValor(valor),
  ]);
  refresh();
}
