import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Boas-vindas", robots: { index: false } };

async function Conteudo() {
  const user = await requireUser();
  return <Onboarding email={user.email} />;
}

// Outside the (app) group on purpose: no sidebar while the account is being set up.
export default function BoasVindas() {
  return (
    <Suspense>
      <Conteudo />
    </Suspense>
  );
}
