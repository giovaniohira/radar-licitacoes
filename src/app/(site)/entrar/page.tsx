import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

async function Erro({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return erro ? <div className="notice danger">O link expirou ou já foi usado. Peça um novo.</div> : null;
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <main id="conteudo" className="auth">
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
        <p className="subtle small">
          Ao entrar você aceita a{" "}
          <Link className="link" href="/privacidade">
            política de privacidade
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
