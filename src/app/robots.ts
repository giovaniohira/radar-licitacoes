import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { robotsFor } from "@/lib/robots";

// Read APP_URL per request, like sitemap.ts, so the runtime .env decides the host. Crawlers only read
// robots.txt at the domain root: under BASE_PATH=/radar this is served at /radar/robots.txt and does
// nothing until the app moves to its own domain.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return robotsFor(process.env.APP_URL ?? "http://localhost:3000");
}
