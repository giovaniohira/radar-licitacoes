import type { Metadata } from "next";

/**
 * Metadata for a public listing whose query string only filters it (/buscar, /mercado). The bare URL is
 * the page worth indexing; any filtered or paged variant points back to it and stays out of the index
 * (follow, so the editais it links to are still found) instead of spawning endless near-duplicates.
 */
export function metadataListagem(
  sp: Record<string, string | string[] | undefined>,
  { path, title, description }: { path: string; title: string; description: string },
): Metadata {
  const filtrada = Object.values(sp).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    ...(filtrada && { robots: { index: false, follow: true } }),
  };
}
