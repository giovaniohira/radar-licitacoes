import { Suspense, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { HBars, ListaRanking, iniciais } from "@/components/charts";
import { JsonLd } from "@/components/JsonLd";
import { SubmitButton } from "@/components/SubmitButton";
import { Kpi, Loading } from "@/components/ui";
import { estaSeguindo } from "@/lib/concorrentes";
import { pool } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatCNPJ, formatInt, nome } from "@/lib/format";
import { first } from "@/lib/params";
import { analisar, fornecedorInfo } from "@/lib/mercado";
import { siteUrl, trilha } from "@/lib/schema";
import { currentUser } from "@/lib/session";
import { pararForm, seguirForm } from "../../../actions/concorrentes";

const getFornecedor = cache((ni: string) => fornecedorInfo(pool(), ni));

export async function generateMetadata({ params }: PageProps<"/fornecedor/[ni]">): Promise<Metadata> {
  const ni = (await params).ni.replace(/\D/g, "");
  const info = ni.length === 14 ? await getFornecedor(ni) : null;
  // A real 404 for crawlers that get the metadata before the body (see htmlLimitedBots); the page body keeps its own notFound().
  if (!info) notFound();
  const title = nome(info.nome);
  const description = `Contratos com o governo, principais órgãos clientes e o que ${title} (CNPJ ${formatCNPJ(ni)}) vende, com dados do PNCP.`;
  return { title, description, alternates: { canonical: `/fornecedor/${ni}` }, openGraph: { title, description } };
}

async function Fornecedor({ params, searchParams }: PageProps<"/fornecedor/[ni]">) {
  await connection();
  // Only companies (14-digit CNPJ) have profiles; individuals are never stored with an identifier.
  const ni = (await params).ni.replace(/\D/g, "");
  if (ni.length !== 14) notFound();
  const info = await getFornecedor(ni);
  if (!info) notFound();
  const m = await analisar(pool(), { fornecedor: ni, dias: 365 });
  const sp = await searchParams;
  const user = await currentUser();
  const seguindo = user ? await estaSeguindo(pool(), user.id, ni) : false;
  const erro = first(sp.erro);

  return (
    <div className="page" style={{ gap: 20 }}>
      <JsonLd data={trilha(siteUrl(), [{ nome: "Mercado", path: "/mercado" }, { nome: nome(info.nome), path: `/fornecedor/${ni}` }])} />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/mercado">Mercado</Link>
        <span>/</span>
        <span>Fornecedor</span>
      </nav>
      <header className="org-head">
        <span className="tile" aria-hidden>
          {iniciais(info.nome)}
        </span>
        <div>
          <h1>{nome(info.nome)}</h1>
          <p>CNPJ {formatCNPJ(ni)}</p>
        </div>
        <div className="org-acao">
          {seguindo ? (
            <form action={pararForm} className="row" style={{ gap: 8 }}>
              <input type="hidden" name="ni" value={ni} />
              <input type="hidden" name="voltar" value="fornecedor" />
              <span className="pill ok">Acompanhando</span>
              <SubmitButton className="btn btn-ghost btn-sm">Parar de acompanhar</SubmitButton>
            </form>
          ) : (
            <form action={seguirForm}>
              <input type="hidden" name="ni" value={ni} />
              <SubmitButton className="btn">Acompanhar</SubmitButton>
            </form>
          )}
        </div>
      </header>
      {first(sp.acompanhando) && <div className="notice ok">Você acompanha {nome(info.nome).replace(/\.$/, "")}. Os contratos novos dela chegam no e-mail das 7h.</div>}
      {first(sp.parou) && <div className="notice ok">Você parou de acompanhar {nome(info.nome).replace(/\.$/, "")}.</div>}
      {erro && <div className="notice">{erro}</div>}

      <section aria-label="Totais" className="kpis">
        <Kpi label="Contratos (12 meses)" value={formatInt(m.totais.contratos)} />
        <Kpi label="Valor contratado" value={formatBRLCompact(m.totais.valor)} hint="nos últimos 12 meses" />
        <Kpi label="Contrato mediano" value={formatBRL(m.totais.mediana)} hint="metade fica abaixo" />
        <Kpi label="Órgãos clientes" value={formatInt(m.totais.orgaos)} hint={`em ${formatInt(m.ufs.length)} estados`} />
      </section>

      <div className="duo">
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h2 style={{ marginBottom: 4 }}>Principais clientes</h2>
          <ListaRanking rows={m.orgaos} href={(id) => `/orgao/${id}`} />
        </section>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h2 style={{ marginBottom: 4 }}>O que vende</h2>
          <HBars rows={m.categorias} />
        </section>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/fornecedor/[ni]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Fornecedor {...props} />
    </Suspense>
  );
}
