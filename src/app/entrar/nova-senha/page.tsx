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
  const email = await tokenSenhaValido(t);
  if (!email) {
    return (
      <>
        <div>
          <h1>Link vencido</h1>
          <p>Esse link expirou ou já foi usado. Peça outro: ele chega em instantes.</p>
        </div>
        <Link href="/entrar/esqueci" className="btn btn-primary btn-block">
          Pedir um link novo
        </Link>
      </>
    );
  }
  return (
    <>
      <div>
        <h1>Crie uma senha nova</h1>
        <p>
          Para <b>{email}</b>. Depois você já entra, e os outros aparelhos são desconectados.
        </p>
      </div>
      <NovaSenhaForm token={t} email={email} />
    </>
  );
}

export default function NovaSenha(props: PageProps<"/entrar/nova-senha">) {
  return (
    <AuthLayout>
      <Suspense>
        <Conteudo {...props} />
      </Suspense>
    </AuthLayout>
  );
}
