import Link from "next/link";
import { Icon, Logo } from "@/components/icons";

const LINKS = [
  { href: "/#como", label: "Como funciona" },
  { href: "/buscar", label: "Buscar editais" },
  { href: "/mercado", label: "Mercado" },
];

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="site-nav">
        <div className="container">
          <Link href="/">
            <Logo />
          </Link>
          <nav>
            {LINKS.map((l) => (
              <Link key={l.href} className="btn btn-ghost hide-sm" href={l.href}>
                {l.label}
              </Link>
            ))}
            <Link className="btn btn-ghost hide-sm" href="/entrar">
              Entrar
            </Link>
            <Link className="btn btn-primary" href="/entrar">
              Criar meu alerta
            </Link>
            {/* Phones get the hidden links in a native disclosure, no JS needed. */}
            <details className="site-menu">
              <summary className="btn btn-ghost" aria-label="Menu">
                <Icon name="menu" size={18} />
              </summary>
              <div className="card">
                {LINKS.map((l) => (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ))}
                <Link href="/entrar">Entrar</Link>
              </div>
            </details>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="container spread">
          <span>
            Dados públicos do{" "}
            <a className="link" href="https://pncp.gov.br" target="_blank" rel="noreferrer">
              Portal Nacional de Contratações Públicas
            </a>
            . Sem vínculo com o governo; confira sempre o edital original.
          </span>
          <span className="row" style={{ gap: 16 }}>
            <Link className="link" href="/privacidade">
              Privacidade
            </Link>
            <a className="link" href="https://github.com/giovaniohira/radar-licitacoes" target="_blank" rel="noreferrer">
              Código no GitHub
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
