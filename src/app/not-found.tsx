import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/icons";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="conteudo" className="centro">
      <div className="card">
        <Logo />
        <h1 style={{ fontSize: 22 }}>Página não encontrada</h1>
        <p className="muted small">O edital, órgão ou fornecedor pode não estar mais no PNCP ou o endereço está incompleto.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/">
            Página inicial
          </Link>
          <Link className="btn btn-primary" href="/buscar">
            Encontrar editais
          </Link>
        </div>
      </div>
    </main>
  );
}
