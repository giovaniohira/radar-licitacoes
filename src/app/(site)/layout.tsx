import Link from "next/link";
import { Icon, Logo } from "@/components/icons";
import { EMPRESA, quemSomos } from "@/lib/empresa";

const NAV = [
  { href: "/#como", label: "Como funciona" },
  { href: "/buscar", label: "Licitações abertas" },
  { href: "/mercado", label: "Mercado" },
  { href: "/#precos", label: "Preços" },
];

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="landing">
      <header className="site-head on-ink">
        <div className="container">
          <Logo />
          <nav aria-label="Site">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="acts">
            <Link className="btn btn-ghost" href="/entrar">
              Entrar
            </Link>
            <Link className="btn btn-light" href="/entrar">
              Começar teste grátis <Icon name="arrowRight" size={14} className="arr" />
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-foot on-ink">
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <Logo />
              <p>
                {EMPRESA.produto} é um serviço da {quemSomos()}.
                {EMPRESA.contato && (
                  <>
                    {" "}
                    <a href={`mailto:${EMPRESA.contato}`}>{EMPRESA.contato}</a>
                  </>
                )}
              </p>
            </div>
            <nav aria-label="Produto" className="foot-col">
              <p className="kicker">Produto</p>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <nav aria-label="Legal" className="foot-col">
              <p className="kicker">Legal</p>
              <Link href="/termos">Termos</Link>
              <Link href="/privacidade">Privacidade</Link>
            </nav>
          </div>
          <div className="foot-base">
            <span>
              Dados públicos do{" "}
              <a href="https://pncp.gov.br" target="_blank" rel="noreferrer">
                PNCP
              </a>
              , sem vínculo com o governo
            </span>
          </div>
          <div className="foot-word" aria-hidden>
            vencedital
          </div>
        </div>
      </footer>
    </div>
  );
}
