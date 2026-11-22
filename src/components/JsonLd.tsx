import { serializar, type JsonLd as Dados } from "@/lib/schema";

/** Structured data for search engines and AI answers. A plain <script>, as the Next.js JSON-LD guide recommends. */
export function JsonLd({ data }: { data: Dados }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializar(data) }} />;
}
