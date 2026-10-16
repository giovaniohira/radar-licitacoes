import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

async function EntrarConteudo({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return (
    <main>
      <h2>Entrar</h2>
      <p className="muted">Sem senha: mandamos um link de acesso para o seu e-mail. Se for a primeira vez, a conta é criada na hora.</p>
      {erro && <p className="error">O link expirou ou já foi usado. Peça um novo.</p>}
      <LoginForm />
    </main>
  );
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <EntrarConteudo {...props} />
    </Suspense>
  );
}
