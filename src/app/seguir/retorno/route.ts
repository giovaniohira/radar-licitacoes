import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SEGUIR, apenasDigitos, ehCnpj, seguirConcorrente } from "@/lib/concorrentes";
import { pool } from "@/lib/db";
import { currentUser } from "@/lib/session";

/**
 * The way back after "Acompanhar" without an account: /painel sends the new user here while the cookie is set. It follows the
 * company, clears the cookie and goes back to the company page. Without the cookie or a session it just opens the painel.
 */
export async function GET() {
  const jar = await cookies();
  const ni = apenasDigitos(jar.get(COOKIE_SEGUIR)?.value);
  const user = await currentUser();
  if (!user || !ehCnpj(ni)) {
    jar.delete(COOKIE_SEGUIR);
    redirect("/painel");
  }
  const erro = await seguirConcorrente(pool(), user.id, ni);
  jar.delete(COOKIE_SEGUIR);
  redirect(`/fornecedor/${ni}?${erro ? `erro=${encodeURIComponent(erro)}` : "acompanhando=1"}`);
}
