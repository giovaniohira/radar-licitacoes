import { Suspense, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Bars, HBars } from "@/components/charts";
import { ContratosTabela } from "@/components/ContratosTabela";
import { EditalItem, Empty, Loading, PageHead, Stat, type EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatCNPJ, formatInt, local, nome } from "@/lib/format";
import { analisar, contratosRecentes, orgaoInfo } from "@/lib/mercado";

const getOrgao = cache((cnpj: string) => orgaoInfo(pool(), cnpj));

export async function generateMetadata({ params }: PageProps<"/orgao/[cnpj]">): Promise<Metadata> {
  const cnpj = (await params).cnpj.replace(/\D/g, "");
  const info = await getOrgao(cnpj);
  if (!info) return { title: "Órgão não encontrado" };
  const title = nome(info.nome);
  const description = `Editais abertos, contratos dos últimos 12 meses e fornecedores que mais vendem para ${title} (${local(info.municipio, info.uf) || "Brasil"}).`;
  return { title, description, alternates: { canonical: `/orgao/${cnpj}` }, openGraph: { title, description } };
}

const ESFERA: Record<string, string> = { M: "Municipal", E: "Estadual", F: "Federal", D: "Distrital" };

async function Orgao({ params }: PageProps<"/orgao/[cnpj]">) {
  await connection();
  const cnpj = (await params).cnpj.replace(/\D/g, "");
  const info = await getOrgao(cnpj);
  if (!info) notFound();
  const f = { orgao: cnpj, dias: 365 };
  const [m, recentes, abertos] = await Promise.all([
    analisar(pool(), f),
    contratosRecentes(pool(), f, 15),
    query<EditalLinha>(
      `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
       from editais where cnpj = $1 and encerramento > now() order by encerramento limit 20`,
      [cnpj],
    ),
  ]);

  return (
    <div className="page">
      <PageHead
        crumbs={
          <>
            <Link href="/mercado">Mercado</Link>/<span>Órgão</span>
          </>
        }
        title={nome(info.nome)}
        sub={[formatCNPJ(cnpj), local(info.municipio, info.uf), info.esfera ? ESFERA[info.esfera] : null].filter(Boolean).join(" · ")}
      />
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Stat label="Editais abertos" value={formatInt(abertos.length)} />
        <Stat label="Contratos (12 meses)" value={formatInt(m.totais.contratos)} />
        <Stat label="Valor contratado" value={formatBRLCompact(m.totais.valor)} />
        <Stat label="Contrato mediano" value={formatBRL(m.totais.mediana)} hint={`${formatInt(m.totais.fornecedores)} fornecedores`} />
      </div>
      <div className="stack-lg">
        <section className="card">
          <div className="card-head">
            <h2>Editais abertos agora</h2>
          </div>
          {abertos.length ? abertos.map((e) => <EditalItem key={e.id} e={e} />) : <Empty title="Nenhum edital aberto agora" />}
        </section>
        {m.totais.contratos > 0 && (
          <>
            <div className="grid g2">
              <section className="card">
                <div className="card-head">
                  <h2>Fornecedores que mais vendem para este órgão</h2>
                </div>
                <div className="card-body">
                  <HBars rows={m.fornecedores.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/fornecedor/${id}`} />
                </div>
              </section>
              <section className="card">
                <div className="card-head">
                  <h2>O que compra</h2>
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
                <h2>Contratos recentes</h2>
              </div>
              <ContratosTabela rows={recentes} ocultar="orgao" />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/orgao/[cnpj]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Orgao {...props} />
    </Suspense>
  );
}
