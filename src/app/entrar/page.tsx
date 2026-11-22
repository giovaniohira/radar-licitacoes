import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

// ?erro=1: a link that expired or was used. ?link: open straight on "Entrar com link".
async function Conteudo({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  return (
    <>
      {sp.erro && (
        <div className="notice" role="alert">
          O link expirou ou já foi usado. Entre com sua senha ou peça um link novo.
        </div>
      )}
      <LoginForm link={sp.link !== undefined} />
    </>
  );
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <AuthLayout>
      <Suspense fallback={<LoginForm />}>
        <Conteudo {...props} />
      </Suspense>
    </AuthLayout>
  );
}
