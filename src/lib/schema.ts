import { DIAS_TESTE, EMPRESA, PRECO_MENSAL } from "./empresa";

/**
 * schema.org data for the public pages. Everything here is a fact the page already shows: the real price,
 * the real company, the FAQ as written. No rating or review is ever emitted (there are no customers yet,
 * and an invented one is a policy violation), and nothing is added that a visitor could not read on the page.
 */

export type JsonLd = Record<string, unknown>;

/** The site's absolute origin, from the same APP_URL the sitemap and metadataBase use (no trailing slash). */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Serializes for a <script type="application/ld+json">: "<" is escaped so no string can close the tag. */
export function serializar(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizacao(base: string): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${base}/#organizacao`,
    name: EMPRESA.produto,
    legalName: EMPRESA.razaoSocial,
    url: base,
    logo: `${base}/icon.svg`,
    ...(EMPRESA.contato && { email: EMPRESA.contato }),
    ...(EMPRESA.cnpj && { taxID: EMPRESA.cnpj }),
    areaServed: "BR",
  };
}

export function site(base: string): JsonLd {
  return {
    "@type": "WebSite",
    "@id": `${base}/#site`,
    name: EMPRESA.produto,
    url: base,
    inLanguage: "pt-BR",
    publisher: { "@id": `${base}/#organizacao` },
  };
}

/** The one plan, at its real price. The free trial is said in words: the price is never "0". */
export function aplicativo(base: string): JsonLd {
  return {
    "@type": "SoftwareApplication",
    "@id": `${base}/#aplicativo`,
    name: EMPRESA.produto,
    url: base,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    description: `Alerta diário de licitações do PNCP por e-mail, com o edital resumido por IA. ${DIAS_TESTE} dias grátis, sem cartão.`,
    publisher: { "@id": `${base}/#organizacao` },
    offers: {
      "@type": "Offer",
      url: `${base}/#precos`,
      price: PRECO_MENSAL.toFixed(2),
      priceCurrency: "BRL",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: PRECO_MENSAL.toFixed(2),
        priceCurrency: "BRL",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
    },
  };
}

/** Must mirror the FAQ printed on the page, question for question. */
export function faq(base: string, itens: { q: string; a: string }[]): JsonLd {
  return {
    "@type": "FAQPage",
    "@id": `${base}/#faq`,
    inLanguage: "pt-BR",
    mainEntity: itens.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function landing(base: string, perguntas: { q: string; a: string }[]): JsonLd {
  return { "@context": "https://schema.org", "@graph": [organizacao(base), site(base), aplicativo(base), faq(base, perguntas)] };
}

/** Breadcrumb for a trail like Mercado > Órgão. `path` is the page's own path, used for the last item. */
export function trilha(base: string, itens: { nome: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map((i, n) => ({ "@type": "ListItem", position: n + 1, name: i.nome, item: `${base}${i.path}` })),
  };
}
