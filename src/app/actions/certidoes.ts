"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apagarCertidao, salvarCertidao } from "@/lib/certidoes";
import { pool } from "@/lib/db";
import { requireUser } from "@/lib/session";

function volta(extra: string): never {
  revalidatePath("/certidoes");
  revalidatePath("/painel");
  revalidatePath("/pipeline");
  redirect(`/certidoes${extra}`);
}

/** Creates or edits one certificate. Errors come back in the URL, which the page shows as a notice. */
export async function salvarCertidaoForm(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id")) || undefined;
  const tipo = String(form.get("tipo") ?? "");
  const erro = await salvarCertidao(pool(), user.id, {
    id,
    tipo,
    nome: String(form.get("nome") ?? ""),
    validaAte: String(form.get("valida_ate") ?? ""),
  });
  volta(erro ? `?erro=${encodeURIComponent(erro)}#${tipo}` : "?ok=1");
}

export async function apagarCertidaoForm(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  if (Number.isInteger(id) && id > 0) await apagarCertidao(pool(), user.id, id);
  volta("?apagada=1");
}
