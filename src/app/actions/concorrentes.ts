"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE_SEGUIR, apenasDigitos, ehCnpj, pararDeSeguir, seguirConcorrente } from "@/lib/concorrentes";
import { pool } from "@/lib/db";
import { currentUser, requireUser } from "@/lib/session";

/** "Acompanhar". Without an account the company is remembered for two days and the visitor goes to sign up. */
export async function seguirForm(form: FormData) {
  const ni = apenasDigitos(form.get("ni"));
  if (!ehCnpj(ni)) redirect("/mercado");
  const user = await currentUser();
  if (!user) {
    (await cookies()).set(COOKIE_SEGUIR, ni, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2 * 86_400, path: "/" });
    redirect("/criar-conta");
  }
  const erro = await seguirConcorrente(pool(), user.id, ni);
  revalidatePath("/alertas");
  redirect(`/fornecedor/${ni}?${erro ? `erro=${encodeURIComponent(erro)}` : "acompanhando=1"}`);
}

/** "Parar de acompanhar", from the company page or from /alertas. */
export async function pararForm(form: FormData) {
  const user = await requireUser();
  const ni = apenasDigitos(form.get("ni"));
  if (ehCnpj(ni)) await pararDeSeguir(pool(), user.id, ni);
  revalidatePath("/alertas");
  redirect(form.get("voltar") === "fornecedor" && ehCnpj(ni) ? `/fornecedor/${ni}?parou=1` : "/alertas?parou=1");
}
