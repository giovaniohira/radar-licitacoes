import Link from "next/link";
import { Logo } from "@/components/icons";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="landing">
      <header className="site-head">
        <div className="container">
          <Logo completo />
          <nav aria-label="Site">
            <Link href="/#como">Como funciona</Link>
            <Link href="/#hoje">O Radar hoje</Link>
            <Link href="/#email">E-mail diário</Link>
          </nav>
          <div className="acts">
            <Link className="btn btn-ghost" href="/entrar" style={{ color: "var(--text)" }}>
              Entrar
            </Link>
            <Link className="btn btn-primary" href="/entrar">
              Começar agora
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-foot">
        <div className="container">
          <span>
            Radar de Licitações · dados públicos do{" "}
            <a href="https://pncp.gov.br" target="_blank" rel="noreferrer">
              PNCP
            </a>
            , sem vínculo com o governo
          </span>
          <Link href="/privacidade">Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}
