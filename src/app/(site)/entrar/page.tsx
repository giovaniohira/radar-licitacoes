import { Suspense } from "react";
import type { Metadata } from "next";
import { entrarDemo } from "../../actions/auth";
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
          <h1 style={{ fontSize: 20 }}>Entrar no Radar</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Sem senha: mandamos um link de acesso para o seu e-mail. Na primeira vez, a conta é criada na hora.
          </p>
        </div>
        <Suspense>
          <Erro {...props} />
        </Suspense>
        <LoginForm />
        <hr className="sep" />
        <form action={entrarDemo}>
          <button className="btn" style={{ width: "100%" }}>
            Só quero ver: abrir a conta demo
          </button>
        </form>
      </div>
    </main>
  );
}
