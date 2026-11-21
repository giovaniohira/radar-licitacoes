import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { editalHref } from "@/components/ui";
import { query } from "@/lib/db";

// Public pages plus every open edital. Served at <APP_URL>/sitemap.xml; submit that URL in Search Console,
// since crawlers only read robots.txt at the domain root, which this app doesn't own.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  // ponytail: one sitemap capped at the 50k-URL limit; split with generateSitemaps if open editais ever pass that.
  const editais = await query<{ id: string; publicado_em: Date }>(
    `select id, publicado_em from editais where encerramento > now() order by publicado_em desc limit 49000`,
  );
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/buscar`, changeFrequency: "daily" },
    { url: `${base}/mercado`, changeFrequency: "weekly" },
    { url: `${base}/privacidade`, changeFrequency: "yearly", priority: 0.2 },
    ...editais.map((e) => ({ url: base + editalHref(e.id), lastModified: e.publicado_em })),
  ];
}
