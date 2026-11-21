import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
// Headings and the "radar" wordmark, same face as the R mark.
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"] });

const description =
  "Nunca mais perca um edital que sua empresa podia ganhar. Alerta diário com as licitações do PNCP que combinam com o que você vende, resumo do edital por IA e controle das propostas até o resultado.";

export const metadata: Metadata = {
  // Absolute URLs for OG images and canonicals; APP_URL is passed at build time (see Dockerfile).
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Radar de Licitações", template: "%s · Radar de Licitações" },
  description,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Radar de Licitações", title: "Radar de Licitações", description },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${display.variable}`}>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
