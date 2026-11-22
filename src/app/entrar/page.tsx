import { Suspense } from "react";
import type { Metadata } from "next";
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
        <h1>Entrar no Vencedital</h1>
        <p>Não tem senha. Digite seu e-mail e mandamos um link para entrar.</p>
      </div>
      <Suspense>
        <Erro {...props} />
      </Suspense>
      <LoginForm />
      <p className="small subtle" style={{ lineHeight: 1.5 }}>
        Primeira vez? É o mesmo caminho: digite seu e-mail e a conta é criada na hora.
      </p>
    </AuthLayout>
  );
}
