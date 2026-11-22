import { connection } from "next/server";
import { siteUrl } from "@/lib/site";
import { ARQUIVOS, LISTAS, indice, maisRecente } from "@/lib/sitemap";

// Index of the sitemaps in /sitemaps. robots.txt points here. Read per request so the runtime APP_URL decides the host.
export async function GET() {
  await connection();
  const base = siteUrl();
  const listas = await Promise.all(ARQUIVOS.map(async (nome) => ({ nome, lastmod: maisRecente(await LISTAS[nome]()) })));
  return new Response(indice(base, listas), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" } });
}
