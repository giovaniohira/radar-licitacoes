import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Radar de Licitações",
  description: "Alertas diários de editais do PNCP para pequenas empresas: palavras-chave, região, faixa de valor e resumo do edital por IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">
              Radar de <span>Licitações</span>
            </Link>
            <div className="links">
              <Link href="/buscar">Buscar</Link>
              <Link href="/painel">Painel</Link>
            </div>
          </nav>
          {children}
          <footer>
            Dados públicos do{" "}
            <a href="https://pncp.gov.br" target="_blank" rel="noreferrer">
              Portal Nacional de Contratações Públicas
            </a>
            , atualizados todo dia. Confira sempre o edital original antes de enviar proposta.
          </footer>
        </div>
      </body>
    </html>
  );
}
