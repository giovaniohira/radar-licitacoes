import { Suspense } from "react";
import type { Metadata } from "next";
import { formatCnpj } from "@/lib/auth";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Boas-vindas", robots: { index: false } };

async function Conteudo() {
  const user = await requireUser();
  const [u] = await query<{ cnpj: string | null }>(`select cnpj from users where id = $1`, [user.id]);
  return <Onboarding email={user.email} cnpj={u?.cnpj ? formatCnpj(u.cnpj) : ""} />;
}

// Outside the (app) group on purpose: no sidebar while the account is being set up.
export default function BoasVindas() {
  return (
    <Suspense>
      <Conteudo />
    </Suspense>
  );
}
