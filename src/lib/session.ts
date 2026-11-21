import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth";
import { query } from "./db";

export interface User {
  id: number;
  email: string;
}

export async function currentUser(): Promise<User | null> {
  // Session checks read the clock (expiry), so they must run per request, never in a prefetch or prerender.
  await connection();
  const s = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  // sessoes_desde is set by "sair de todos os dispositivos"; older sessions stop working.
  const rows = await query<User>(
    `select id, email from users where id = $1 and (sessoes_desde is null or sessoes_desde <= to_timestamp($2))`,
    [s.id, s.emitida],
  );
  return rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  return user;
}
