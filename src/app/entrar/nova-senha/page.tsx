import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { tokenSenhaValido } from "@/lib/contas";
import { NovaSenhaForm } from "./NovaSenhaForm";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };

// Only reads the token: it is spent when the new password is saved, so a mail scanner opening the link burns nothing.
async function Conteudo({ searchParams }: PageProps<"/entrar/nova-senha">) {
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : "";
  if (!(await tokenSenhaValido(t))) {
    return (
      <>
        <div className="notice">Esse link expirou ou já foi usado.</div>
        <Link href="/entrar/esqueci" className="btn btn-primary">
          Pedir um novo link
        </Link>
      </>
    );
  }
  return <NovaSenhaForm token={t} />;
}

export default function NovaSenha(props: PageProps<"/entrar/nova-senha">) {
  return (
    <AuthLayout>
      <div>
        <h1>Criar nova senha</h1>
        <p>Depois de salvar, você entra direto e os outros aparelhos são desconectados.</p>
      </div>
      <Suspense>
        <Conteudo {...props} />
      </Suspense>
    </AuthLayout>
  );
}
