import { Suspense } from "react";
import { confirmarLogin } from "../../actions";

// A page with a button instead of a GET handler: mail scanners that prefetch links would otherwise burn the single-use token.
async function ConfirmarConteudo({ searchParams }: PageProps<"/entrar/confirmar">) {
  const { token } = await searchParams;
  return (
    <main>
      <h2>Entrar no Radar</h2>
      <form action={confirmarLogin}>
        <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />
        <button type="submit">Continuar para o painel</button>
      </form>
    </main>
  );
}

export default function Confirmar(props: PageProps<"/entrar/confirmar">) {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <ConfirmarConteudo {...props} />
    </Suspense>
  );
}
