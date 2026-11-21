import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

async function Erro({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return erro ? <div className="notice">O link expirou ou já foi usado. Peça um novo.</div> : null;
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <AuthLayout>
      <div>
        <h1>Entrar no Radar</h1>
        <p>Sem senha: mandamos um link de acesso para o seu e-mail.</p>
      </div>
      <Suspense>
        <Erro {...props} />
      </Suspense>
      <LoginForm />
      <p className="small subtle" style={{ lineHeight: 1.5 }}>
        Primeira vez? É o mesmo caminho: digite seu e-mail e a conta é criada na hora.
      </p>
      <p className="xs subtle">
        Ao entrar, você concorda com a <Link href="/privacidade">política de privacidade</Link>.
      </p>
    </AuthLayout>
  );
}
