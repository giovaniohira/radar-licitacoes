import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "./auth";
import { query } from "./db";

export async function currentUser(): Promise<{ id: number; email: string } | null> {
  const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const rows = await query<{ id: number; email: string }>(`select id, email from users where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  return user;
}
