import type { MetadataRoute } from "next";

/** Signed-in or token-bearing routes. Their pages already set `robots: { index: false }`; this also stops the crawl. */
export const PRIVADAS = ["/painel", "/pipeline", "/alertas", "/conta", "/boas-vindas", "/entrar"];

/** Filtered or paged variants of the public listings: every one is a near-duplicate of the bare URL. */
export const FILTRADAS = ["/buscar?", "/mercado?"];

/**
 * AI crawlers, by what they do. Search and user-triggered fetchers are what get the site cited in answers;
 * training crawlers only feed models. Everything is allowed today (the content is public PNCP data and the
 * goal is to be cited), but each bot is named so the choice is explicit and a single list can flip it.
 * Keep `htmlLimitedBots` in next.config.ts in sync: these bots must get the metadata in the `<head>`.
 */
export const ROBOS_IA_BUSCA = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User"];
export const ROBOS_IA_TREINO = ["GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "CCBot"];

/**
 * robots.txt paths are relative to the host root, so a sub-path deploy (APP_URL=https://host/radar)
 * needs the prefix. With the app at a domain root the prefix is empty.
 */
export function robotsFor(appUrl: string): MetadataRoute.Robots {
  const base = new URL(appUrl);
  const prefixo = base.pathname.replace(/\/+$/, "");
  // "/pipeline" also covers the private /pipeline.ics feed (prefix match).
  const regra = { allow: `${prefixo}/`, disallow: [...PRIVADAS, ...FILTRADAS].map((p) => prefixo + p) };
  return {
    // A crawler obeys only the most specific group that names it, so the named AI bots repeat the same paths.
    rules: [{ userAgent: "*", ...regra }, { userAgent: [...ROBOS_IA_BUSCA, ...ROBOS_IA_TREINO], ...regra }],
    sitemap: `${base.origin}${prefixo}/sitemap.xml`,
  };
}
