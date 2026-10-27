import { Suspense, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Bars, HBars } from "@/components/charts";
import { ContratosTabela } from "@/components/ContratosTabela";
import { Loading, PageHead, Stat } from "@/components/ui";
import { pool } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatCNPJ, formatInt, nome } from "@/lib/format";
import { analisar, contratosRecentes, fornecedorInfo } from "@/lib/mercado";

const getFornecedor = cache((ni: string) => fornecedorInfo(pool(), ni));

export async function generateMetadata({ params }: PageProps<"/fornecedor/[ni]">): Promise<Metadata> {
  const ni = (await params).ni.replace(/\D/g, "");
  const info = ni.length === 14 ? await getFornecedor(ni) : null;
  if (!info) return { title: "Fornecedor não encontrado" };
  const title = nome(info.nome);
  const description = `Contratos com o governo, principais órgãos clientes e o que ${title} (CNPJ ${formatCNPJ(ni)}) vende, com dados do PNCP.`;
  return { title, description, alternates: { canonical: `/fornecedor/${ni}` }, openGraph: { title, description } };
}

async function Fornecedor({ params }: PageProps<"/fornecedor/[ni]">) {
  await connection();
  // Only companies (14-digit CNPJ) have profiles; individuals are never stored with an identifier.
  const ni = (await params).ni.replace(/\D/g, "");
  if (ni.length !== 14) notFound();
  const info = await getFornecedor(ni);
  if (!info) notFound();
  const f = { fornecedor: ni, dias: 365 };
  const [m, recentes] = await Promise.all([analisar(pool(), f), contratosRecentes(pool(), f, 20)]);

  return (
    <div className="page">
      <PageHead
        crumbs={
          <>
            <Link href="/mercado">Mercado</Link>/<span>Fornecedor</span>
          </>
        }
        title={nome(info.nome)}
        sub={`CNPJ ${formatCNPJ(ni)}`}
      />
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Stat label="Contratos (12 meses)" value={formatInt(m.totais.contratos)} />
        <Stat label="Valor contratado" value={formatBRLCompact(m.totais.valor)} />
        <Stat label="Contrato mediano" value={formatBRL(m.totais.mediana)} />
        <Stat label="Órgãos clientes" value={formatInt(m.totais.orgaos)} hint={`em ${formatInt(m.ufs.length)} estados`} />
      </div>
      <div className="stack-lg">
        <div className="grid g2">
          <section className="card">
            <div className="card-head">
              <h2>Principais clientes</h2>
            </div>
            <div className="card-body">
              <HBars rows={m.orgaos.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/orgao/${id}`} />
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>O que vende</h2>
            </div>
            <div className="card-body">
              <HBars rows={m.categorias} />
            </div>
          </section>
        </div>
        <section className="card">
          <div className="card-head">
            <h2>Contratado por semana</h2>
          </div>
          <div className="card-body">
            <Bars points={m.serie} />
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Contratos</h2>
          </div>
          <ContratosTabela rows={recentes} ocultar="fornecedor" />
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
