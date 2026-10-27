import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

async function Erro({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return erro ? <div className="notice danger">O link expirou ou já foi usado. Peça um novo.</div> : null;
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <main className="auth">
      <div className="card">
        <div>
          <h1 style={{ fontSize: 20 }}>Entrar ou criar conta</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Sem senha: mandamos um link para o seu e-mail. Se for sua primeira vez, a conta é criada quando você clicar nele.
          </p>
        </div>
        <Suspense>
          <Erro {...props} />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}
