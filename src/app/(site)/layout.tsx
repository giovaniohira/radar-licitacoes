import Link from "next/link";
import { Logo } from "@/components/icons";
import { EMPRESA, quemSomos } from "@/lib/empresa";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="landing">
      <header className="site-head">
        <div className="container">
          <Logo />
          <nav aria-label="Site">
            <Link href="/#como">Como funciona</Link>
            <Link href="/buscar">Licitações abertas</Link>
            <Link href="/mercado">Mercado</Link>
            <Link href="/#precos">Preços</Link>
          </nav>
          <div className="acts">
            <Link className="btn btn-ghost" href="/entrar" style={{ color: "var(--text)" }}>
              Entrar
            </Link>
            <Link className="btn btn-primary" href="/entrar">
              Começar teste grátis
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-foot">
        <div className="container">
          <span>
            {EMPRESA.produto} é um serviço da {quemSomos()} ·{" "}
            {EMPRESA.contato && (
              <>
                <a href={`mailto:${EMPRESA.contato}`}>{EMPRESA.contato}</a> ·{" "}
              </>
            )}
            dados públicos do{" "}
            <a href="https://pncp.gov.br" target="_blank" rel="noreferrer">
              PNCP
            </a>
            , sem vínculo com o governo
          </span>
          <span className="row" style={{ gap: 16 }}>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
