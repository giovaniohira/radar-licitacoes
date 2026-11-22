import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

async function Erro({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return erro ? <div className="notice">O link expirou ou já foi usado. Entre com sua senha ou peça um novo link.</div> : null;
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <AuthLayout>
      <div>
        <h1>Entrar no Vencedital</h1>
        <p>Use seu e-mail ou o CNPJ da empresa, e a senha.</p>
      </div>
      <Suspense>
        <Erro {...props} />
      </Suspense>
      <LoginForm />
      <p className="small subtle" style={{ lineHeight: 1.5 }}>
        Primeira vez? <Link href="/criar-conta">Crie sua conta</Link> em 1 minuto.
      </p>
    </AuthLayout>
  );
}
