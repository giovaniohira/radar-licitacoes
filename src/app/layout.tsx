import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
// Headings and the "vencedital" wordmark.
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"] });

const title = "Vencedital — alerta diário de licitações do PNCP, com o edital lido por IA";
const description =
  "Todo dia às 7h, as licitações novas do seu ramo no seu e-mail, já resumidas por IA: prazos, habilitação, cota ME/EPP e pontos de atenção. 14 dias grátis, preço na tela.";

export const metadata: Metadata = {
  // Absolute URLs for OG images and canonicals; APP_URL is passed at build time (see Dockerfile).
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: title, template: "%s · Vencedital" },
  description,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Vencedital", title, description },
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
