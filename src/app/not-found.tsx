import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/icons";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="conteudo" className="auth">
      <div className="card" style={{ textAlign: "center" }}>
        <div>
          <Logo />
        </div>
        <h1 style={{ fontSize: 20 }}>Página não encontrada</h1>
        <p className="muted small">O edital, órgão ou fornecedor pode não estar mais no PNCP ou o endereço está incompleto.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/">
            Página inicial
          </Link>
          <Link className="btn btn-primary" href="/buscar">
            Buscar editais
          </Link>
        </div>
      </div>
    </main>
  );
}
