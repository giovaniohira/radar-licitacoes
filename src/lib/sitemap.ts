import { cacheLife } from "next/cache";
import { query } from "./db";
import { LIMIARES } from "./indexacao";

export type Entrada = { path: string; lastmod?: Date | string | null };

/** Protocol limit per file is 50,000 URLs or 50 MB; stay under it with room. */
export const MAX_URLS = 45000;

export const ARQUIVOS = ["paginas", "editais", "orgaos", "fornecedores"] as const;
export type Arquivo = (typeof ARQUIVOS)[number];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** W3C datetime, which is what Google and Bing read. Invalid or missing dates are left out rather than guessed. */
function data(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

// changefreq and priority are left out on purpose: Google ignores both, and lastmod only counts when it is true.
export function urlset(base: string, entradas: Entrada[]): string {
  const itens = entradas.slice(0, MAX_URLS).map((e) => {
    const m = data(e.lastmod);
    return `<url><loc>${esc(base + e.path)}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens.join("\n")}\n</urlset>\n`;
}

export function indice(base: string, arquivos: { nome: string; lastmod?: Date | string | null }[]): string {
  const itens = arquivos.map((a) => {
    const m = data(a.lastmod);
    return `<sitemap><loc>${esc(`${base}/sitemaps/${a.nome}.xml`)}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens.join("\n")}\n</sitemapindex>\n`;
}

// Each list is cached for an hour (the database only changes when the ingest runs), so crawlers hitting
// the sitemaps never turn into per-request aggregate queries on the small database container.

/** Newest ingest, used as the lastmod of pages whose content is a live view of the editais. */
async function ultimaIngestao(): Promise<Date | null> {
  const [r] = await query<{ m: Date | null }>(`select max(ingerido_em) as m from editais`);
  return r?.m ?? null;
}

export async function paginas(): Promise<Entrada[]> {
  "use cache";
  cacheLife("hours");
  const m = await ultimaIngestao();
  // /termos and /privacidade carry no lastmod: nothing in the data says when they last changed.
  return [{ path: "", lastmod: m }, { path: "/buscar", lastmod: m }, { path: "/mercado", lastmod: m }, { path: "/privacidade" }, { path: "/termos" }];
}

export async function editais(): Promise<Entrada[]> {
  "use cache";
  cacheLife("hours");
  const rows = await query<{ id: string; m: Date }>(
    `select id, coalesce(atualizado_em, publicado_em) as m from editais where encerramento > now() order by publicado_em desc limit ${MAX_URLS}`,
  );
  return rows.map((r) => ({ path: `/edital/${encodeURIComponent(r.id)}`, lastmod: r.m }));
}

export async function orgaos(): Promise<Entrada[]> {
  "use cache";
  cacheLife("hours");
  const rows = await query<{ cnpj: string; m: Date | null }>(
    `with c as (
       select orgao_cnpj as cnpj, count(*) as n, max(coalesce(atualizado_em, publicado_em)) as m
       from contratos where data_assinatura between current_date - 365 and current_date group by 1
     ), e as (
       select cnpj, count(*) as n, max(coalesce(atualizado_em, publicado_em)) as m
       from editais where encerramento > now() group by 1
     )
     select coalesce(c.cnpj, e.cnpj) as cnpj, greatest(c.m, e.m) as m
     from c full join e on c.cnpj = e.cnpj
     where coalesce(c.n, 0) >= $1 or coalesce(e.n, 0) >= $2
     order by 2 desc nulls last limit ${MAX_URLS}`,
    [LIMIARES.orgaoContratos, LIMIARES.orgaoEditaisAbertos],
  );
  return rows.map((r) => ({ path: `/orgao/${r.cnpj}`, lastmod: r.m }));
}

export async function fornecedores(): Promise<Entrada[]> {
  "use cache";
  cacheLife("hours");
  // 14 digits only: individuals are never given a profile page.
  const rows = await query<{ ni: string; m: Date | null }>(
    `select fornecedor_ni as ni, max(coalesce(atualizado_em, publicado_em)) as m
     from contratos
     where length(fornecedor_ni) = 14 and data_assinatura between current_date - 365 and current_date
     group by 1 having count(*) >= $1 and count(distinct orgao_cnpj) >= $2
     order by 2 desc nulls last limit ${MAX_URLS}`,
    [LIMIARES.fornecedorContratos, LIMIARES.fornecedorOrgaos],
  );
  return rows.map((r) => ({ path: `/fornecedor/${r.ni}`, lastmod: r.m }));
}

export const LISTAS: Record<Arquivo, () => Promise<Entrada[]>> = { paginas, editais, orgaos, fornecedores };

/** Newest lastmod of a list, for the index entry. */
export function maisRecente(entradas: Entrada[]): Date | null {
  let max: Date | null = null;
  for (const e of entradas) {
    const t = e.lastmod ? new Date(e.lastmod) : null;
    if (t && !Number.isNaN(t.getTime()) && (!max || t > max)) max = t;
  }
  return max;
}
