import { connection, type NextRequest } from "next/server";
import { verifyIcsToken } from "@/lib/auth";
import { pool } from "@/lib/db";
import { ETAPAS_ATIVAS, listPipeline, renderIcs } from "@/lib/pipeline";

// Read-only calendar feed for Google Calendar/Outlook. Auth is an HMAC token in the URL, since calendar apps send no cookies.
export async function GET(req: NextRequest) {
  await connection();
  const userId = Number(req.nextUrl.searchParams.get("u"));
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!Number.isInteger(userId) || userId <= 0 || !verifyIcsToken(userId, token)) {
    return new Response("not found", { status: 404 });
  }
  const itens = (await listPipeline(pool(), userId)).filter((i) => [...ETAPAS_ATIVAS, "enviada"].includes(i.etapa));
  return new Response(renderIcs(process.env.APP_URL ?? "http://localhost:3000", itens), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900" },
  });
}
