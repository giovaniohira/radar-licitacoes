import type { MetadataRoute } from "next";

/** Signed-in or token-bearing routes. Their pages already set `robots: { index: false }`; this also stops the crawl. */
export const PRIVADAS = ["/painel", "/pipeline", "/alertas", "/conta", "/boas-vindas", "/entrar/confirmar"];

/**
 * robots.txt paths are relative to the host root, so a sub-path deploy (APP_URL=https://host/radar)
 * needs the prefix. With the app at a domain root the prefix is empty.
 */
export function robotsFor(appUrl: string): MetadataRoute.Robots {
  const base = new URL(appUrl);
  const prefixo = base.pathname.replace(/\/+$/, "");
  return {
    // "/pipeline" also covers the private /pipeline.ics feed (prefix match).
    rules: { userAgent: "*", allow: `${prefixo}/`, disallow: PRIVADAS.map((p) => prefixo + p) },
    sitemap: `${base.origin}${prefixo}/sitemap.xml`,
  };
}
