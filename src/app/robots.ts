import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { robotsFor } from "@/lib/robots";

// Read APP_URL per request, like sitemap.ts, so the runtime .env decides the host. Crawlers only read
// robots.txt at the domain root, so it needs the app at the root of its domain (empty BASE_PATH).
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return robotsFor(process.env.APP_URL ?? "http://localhost:3000");
}
