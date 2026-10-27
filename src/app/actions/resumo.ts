"use server";

import { pool, query } from "@/lib/db";
import type { EditalRow } from "@/lib/pncp";
import { requireUser } from "@/lib/session";
import { ResumoError, getOrCreateResumo, type Resumo } from "@/lib/summary";

export type ResumoState = { resumo?: Resumo; documento?: string; error?: string } | null;

export async function resumir(_: ResumoState, form: FormData): Promise<ResumoState> {
  const user = await requireUser();
  const editalId = String(form.get("edital"));
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Resumo por IA não configurado neste servidor." };
  const [edital] = await query<EditalRow>(`select * from editais where id = $1`, [editalId]);
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
