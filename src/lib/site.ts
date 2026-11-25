/** The site's absolute origin, from the same APP_URL the metadataBase and robots.txt use (no trailing slash). */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
