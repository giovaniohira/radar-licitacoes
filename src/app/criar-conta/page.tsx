import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { DIAS_TESTE } from "@/lib/empresa";
import { CadastroForm } from "./CadastroForm";

export const metadata: Metadata = { title: "Criar conta" };

// The landing page's hero form sends the e-mail here as ?email=.
async function Formulario({ searchParams }: PageProps<"/criar-conta">) {
  const { email } = await searchParams;
  return <CadastroForm email={typeof email === "string" ? email.slice(0, 254) : ""} />;
}

export default function CriarConta(props: PageProps<"/criar-conta">) {
  return (
    <AuthLayout>
      <div>
        <h1>Criar conta</h1>
        <p>{DIAS_TESTE} dias grátis, sem cartão. Depois de criar, confirme pelo link que chega no seu e-mail.</p>
      </div>
      <Suspense fallback={<CadastroForm email="" />}>
        <Formulario {...props} />
      </Suspense>
      <p className="small subtle" style={{ lineHeight: 1.5 }}>
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </AuthLayout>
  );
}
