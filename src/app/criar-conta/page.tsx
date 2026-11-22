import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { DIAS_TESTE } from "@/lib/empresa";
import { CadastroForm } from "./CadastroForm";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false } };

// The landing page's hero form sends the e-mail here as ?email=.
async function Formulario({ searchParams }: PageProps<"/criar-conta">) {
  const { email } = await searchParams;
  return <CadastroForm email={typeof email === "string" ? email.slice(0, 254) : ""} />;
}

export default function CriarConta(props: PageProps<"/criar-conta">) {
  return (
    <AuthLayout passo={0}>
      <div>
        <p className="kicker">Teste grátis · {DIAS_TESTE} dias</p>
        <h1>Crie sua conta</h1>
        <p>Leva um minuto. O CNPJ vem depois, para já montar seu alerta.</p>
      </div>
      <Suspense fallback={<CadastroForm email="" />}>
        <Formulario {...props} />
      </Suspense>
      <p className="auth-alt">
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </AuthLayout>
  );
}
