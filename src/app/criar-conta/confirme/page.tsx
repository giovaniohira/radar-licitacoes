import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthLayout } from "@/components/AuthLayout";
import { emailPendente } from "../../actions/auth";
import { Confirme } from "./Confirme";

export const metadata: Metadata = { title: "Confirme seu e-mail", robots: { index: false } };

// The address comes from a short-lived cookie set when the account was created (or a password sign-in found it unconfirmed).
/** Who is waiting, and when the first resend is allowed: the link was just sent. Request time, after the cookie. */
async function pendente() {
  const email = await emailPendente();
  // Reading a cookie inside a Server Action call is not enough for the prerender check: say it outright.
  await connection();
  return email ? { email, reenvioApos: Date.now() + 60_000 } : null;
}

async function Conteudo() {
  const p = await pendente();
  if (!p) redirect("/criar-conta");
  return <Confirme email={p.email} reenvioApos={p.reenvioApos} />;
}

export default function Page() {
  return (
    <AuthLayout passo={1}>
      <Suspense>
        <Conteudo />
      </Suspense>
    </AuthLayout>
  );
}
