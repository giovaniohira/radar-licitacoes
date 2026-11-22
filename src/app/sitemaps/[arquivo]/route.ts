import { connection } from "next/server";
import { siteUrl } from "@/lib/site";
import { ARQUIVOS, LISTAS, urlset, type Arquivo } from "@/lib/sitemap";

// /sitemaps/paginas.xml, editais.xml, orgaos.xml, fornecedores.xml
export async function GET(_req: Request, ctx: RouteContext<"/sitemaps/[arquivo]">) {
  await connection();
  const nome = (await ctx.params).arquivo.replace(/\.xml$/, "") as Arquivo;
  if (!ARQUIVOS.includes(nome)) return new Response("Not found", { status: 404 });
  return new Response(urlset(siteUrl(), await LISTAS[nome]()), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
