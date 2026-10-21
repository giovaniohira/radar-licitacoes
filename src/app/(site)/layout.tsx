import Link from "next/link";
import { Logo } from "@/components/icons";
import { entrarDemo } from "../actions/auth";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="site-nav">
        <div className="container">
          <Link href="/">
            <Logo />
          </Link>
          <nav>
            <Link className="btn btn-ghost hide-sm" href="/buscar">
              Buscar editais
            </Link>
            <Link className="btn btn-ghost hide-sm" href="/mercado">
              Mercado
            </Link>
            <Link className="btn btn-ghost" href="/entrar">
              Entrar
            </Link>
            <form action={entrarDemo}>
              <button className="btn btn-primary">Ver demo</button>
            </form>
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
          <a className="link" href="https://github.com/giovaniohira/radar-licitacoes" target="_blank" rel="noreferrer">
            Código no GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
