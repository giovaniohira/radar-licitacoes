import type { NextConfig } from "next";

// With Cache Components, title, description, canonical and Open Graph stream into the <body> after the
// shell, and only reach the <head> for user agents on this list (Next waits for the metadata for them).
// Setting the option replaces Next's own list, so this is that list (html-bots.ts in next/dist, checked
// on 16.4.6) plus the AI crawlers and Googlebot. Crawlers that read raw HTML and skip JavaScript would
// otherwise see a page with no title, description or canonical. Keep it in sync with src/lib/robots.ts
// (tests/unit.test.ts checks it).
const HTML_LIMITED_BOTS = new RegExp(
  [
    String.raw`[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight`,
    "Googlebot|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Amazonbot|Bytespider|meta-externalagent",
  ].join("|"),
  "i",
);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  htmlLimitedBots: HTML_LIMITED_BOTS,
  output: "standalone",
  // Set at build time to serve under a sub-path, e.g. BASE_PATH=/radar.
  basePath: process.env.BASE_PATH || undefined,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
