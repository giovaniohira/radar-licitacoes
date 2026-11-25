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
        <p>Mandamos um link para criar uma senha nova. Vale 30 minutos. Serve também para quem sempre entrou só pelo link.</p>
      </div>
      <EsqueciForm />
      <p className="auth-alt">
        <Link href="/entrar">Voltar para entrar</Link>
      </p>
    </AuthLayout>
  );
}
