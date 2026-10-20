import { Suspense } from "react";
import { confirmarLogin } from "../../../actions/auth";

// A button instead of a GET handler: mail scanners that prefetch links would otherwise burn the single-use token.
async function TokenField({ searchParams }: PageProps<"/entrar/confirmar">) {
  const { token } = await searchParams;
  return <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />;
}

export default function Confirmar(props: PageProps<"/entrar/confirmar">) {
  return (
    <main className="auth">
      <form className="card" action={confirmarLogin}>
        <h1 style={{ fontSize: 20 }}>Quase lá</h1>
        <p className="muted small">Confirme para entrar no Radar neste navegador.</p>
        <Suspense>
          <TokenField {...props} />
        </Suspense>
        <button type="submit" className="btn btn-primary btn-lg">
          Entrar
        </button>
      </form>
    </main>
  );
}
