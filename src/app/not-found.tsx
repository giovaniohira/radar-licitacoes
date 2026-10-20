import Link from "next/link";
import { Logo } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="auth">
      <div className="card" style={{ textAlign: "center" }}>
        <div>
          <Logo />
        </div>
        <h1 style={{ fontSize: 20 }}>Página não encontrada</h1>
        <p className="muted small">O edital, órgão ou fornecedor pode não estar mais no PNCP ou o endereço está incompleto.</p>
        <Link className="btn btn-primary" href="/buscar">
          Buscar editais
        </Link>
      </div>
    </main>
  );
}
