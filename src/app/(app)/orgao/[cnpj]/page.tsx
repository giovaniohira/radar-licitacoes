import { Suspense, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { HBars, ListaRanking, iniciais } from "@/components/charts";
import { JsonLd } from "@/components/JsonLd";
import { EditalRow, EditalRows, Empty, Interesse, Kpi, Loading, type EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatCNPJ, formatInt, local, nome, prazo } from "@/lib/format";
import { analisar, orgaoInfo } from "@/lib/mercado";
import { siteUrl, trilha } from "@/lib/schema";
import { currentUser } from "@/lib/session";

const getOrgao = cache((cnpj: string) => orgaoInfo(pool(), cnpj));

export async function generateMetadata({ params }: PageProps<"/orgao/[cnpj]">): Promise<Metadata> {
  const cnpj = (await params).cnpj.replace(/\D/g, "");
  const info = await getOrgao(cnpj);
  // A real 404 for crawlers that get the metadata before the body (see htmlLimitedBots); the page body keeps its own notFound().
  if (!info) notFound();
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
  const [m, abertos, user] = await Promise.all([
    analisar(pool(), { orgao: cnpj, dias: 365 }),
    query<EditalLinha>(
      `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
       from editais where cnpj = $1 and encerramento > now() order by encerramento limit 20`,
      [cnpj],
    ),
    currentUser(),
  ]);
  const etapas =
    user && abertos.length
      ? new Map(
          (await query<{ edital_id: string; etapa: string }>(`select edital_id, etapa from pipeline where user_id = $1 and edital_id = any($2::text[])`, [user.id, abertos.map((a) => a.id)])).map(
            (r) => [r.edital_id, r.etapa],
          ),
        )
      : new Map<string, string>();

  return (
    <div className="page" style={{ gap: 20 }}>
      <JsonLd data={trilha(siteUrl(), [{ nome: "Mercado", path: "/mercado" }, { nome: nome(info.nome), path: `/orgao/${cnpj}` }])} />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/mercado">Mercado</Link>
        <span>/</span>
        <span>Órgão</span>
      </nav>
      <header className="org-head">
        <span className="tile" aria-hidden>
          {iniciais(info.nome)}
        </span>
        <div>
          <h1>{nome(info.nome)}</h1>
          <p>{[info.esfera ? ESFERA[info.esfera] : null, local(info.municipio, info.uf), `CNPJ ${formatCNPJ(cnpj)}`].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <section aria-label="Totais" className="kpis">
        <Kpi label="Editais abertos" value={formatInt(abertos.length)} hint={abertos[0] ? `o próximo fecha ${prazo(abertos[0].encerramento)}` : "nenhum aberto agora"} />
        <Kpi label="Contratos (12 meses)" value={formatInt(m.totais.contratos)} hint={`${formatInt(m.totais.fornecedores)} fornecedores`} />
        <Kpi label="Valor contratado" value={formatBRLCompact(m.totais.valor)} hint="nos últimos 12 meses" />
        <Kpi label="Contrato mediano" value={formatBRL(m.totais.mediana)} hint="metade fica abaixo" />
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        <div className="card-head">
          <h2>Editais abertos agora</h2>
          <span className="xs subtle">{abertos.length === 1 ? "1 aberto" : `${formatInt(abertos.length)} abertos`}</span>
        </div>
        {abertos.length ? (
          <EditalRows>
            {abertos.map((e) => (
              <EditalRow key={e.id} e={e} apagado={etapas.get(e.id) === "descartada"} acoes={<Interesse id={e.id} etapa={etapas.get(e.id)} />} />
            ))}
          </EditalRows>
        ) : (
          <Empty title="Nenhum edital aberto agora" />
        )}
      </section>

      {m.totais.contratos > 0 && (
        <div className="duo">
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <h2 style={{ marginBottom: 4 }}>O que compra</h2>
            <HBars rows={m.categorias} />
          </section>
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <h2 style={{ marginBottom: 4 }}>Fornecedores que mais vendem para este órgão</h2>
            <ListaRanking rows={m.fornecedores} href={(id) => `/fornecedor/${id}`} />
          </section>
        </div>
      )}
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
