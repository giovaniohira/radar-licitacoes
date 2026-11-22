import { connection } from "next/server";
import { llmsTxt, numeros } from "@/lib/llms";
import { siteUrl } from "@/lib/site";

// /llms.txt: a plain-text guide for AI assistants (llmstxt.org). Read per request so the numbers carry today's date.
export async function GET() {
  await connection();
  return new Response(llmsTxt(siteUrl(), await numeros()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
