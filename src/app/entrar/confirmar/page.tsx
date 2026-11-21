import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/AuthLayout";
import { confirmarLogin } from "../../actions/auth";

export const metadata: Metadata = { title: "Confirmar acesso", robots: { index: false } };

// A button instead of a GET handler: mail scanners that prefetch links would otherwise burn the single-use token.
async function TokenField({ searchParams }: PageProps<"/entrar/confirmar">) {
  const { token } = await searchParams;
  return <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />;
}

export default function Confirmar(props: PageProps<"/entrar/confirmar">) {
  return (
    <AuthLayout>
      <div>
        <h1>Quase lá</h1>
        <p>Confirme para entrar no Vencedital neste navegador.</p>
      </div>
      <form action={confirmarLogin} className="stack">
        <Suspense>
          <TokenField {...props} />
        </Suspense>
        <button type="submit" className="btn btn-primary">
          Entrar
        </button>
      </form>
    </AuthLayout>
  );
}
