import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth";
import { query } from "./db";

export interface User {
  id: number;
  email: string;
  demo: boolean;
}

export async function currentUser(): Promise<User | null> {
  // Session checks read the clock (expiry), so they must run per request, never in a prefetch or prerender.
  await connection();
  const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const rows = await query<User>(`select id, email, demo from users where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  return user;
}
