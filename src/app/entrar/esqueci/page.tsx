import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { EsqueciForm } from "./EsqueciForm";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function Esqueci() {
  return (
    <AuthLayout>
      <div>
        <h1>Esqueci a senha</h1>
        <p>Digite seu e-mail ou CNPJ. Mandamos um link para você criar uma senha nova. Serve também para quem sempre entrou só pelo link.</p>
      </div>
      <EsqueciForm />
      <p className="small subtle">
        <Link href="/entrar">Voltar para entrar</Link>
      </p>
    </AuthLayout>
  );
}
