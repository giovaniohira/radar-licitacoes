import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { EditalItem, Loading, PageHead, PrazoBadge, Stat, type EditalLinha } from "@/components/ui";
import { query } from "@/lib/db";
import { formatBRL, formatCNPJ, formatData, frase, local, nome } from "@/lib/format";
import { fetchArquivos, pncpUrl, type EditalRow } from "@/lib/pncp";
import { ETAPAS } from "@/lib/pipeline";
import { currentUser } from "@/lib/session";
import type { Resumo } from "@/lib/summary";
import { adicionarAoPipeline, mudarEtapa, removerDoPipeline } from "../../../actions/pipeline";
import { ResumoIA } from "./ResumoIA";

export const metadata: Metadata = { title: "Edital" };

const ESFERA: Record<string, string> = { M: "Municipal", E: "Estadual", F: "Federal", D: "Distrital" };

type Edital = EditalRow & { valor_estimado: string | null };

async function Documentos({ e }: { e: Edital }) {
  let arquivos: Awaited<ReturnType<typeof fetchArquivos>> = [];
  try {
    arquivos = (await fetchArquivos(e, { retries: 1 })).filter((a) => a.statusAtivo);
  } catch {
    return <p className="small muted">O PNCP não respondeu agora. Veja os documentos direto no portal.</p>;
  }
  if (!arquivos.length) return <p className="small muted">Nenhum documento publicado no PNCP.</p>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {arquivos.map((a) => (
        <a key={a.sequencialDocumento} className="row small link" href={a.url} target="_blank" rel="noreferrer" style={{ flexWrap: "nowrap" }}>
          <Icon name="file" size={14} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titulo}</span>
          {a.tipoDocumentoNome && <span className="badge plain">{a.tipoDocumentoNome}</span>}
        </a>
      ))}
    </div>
  );
}

async function MaisDoOrgao({ e }: { e: Edital }) {
  const rows = await query<EditalLinha>(
    `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
     from editais where cnpj = $1 and id <> $2 and encerramento > now() order by encerramento limit 4`,
    [e.cnpj, e.id],
  );
  if (!rows.length) return <div className="card-body small muted">Nenhum outro edital aberto deste órgão.</div>;
  return rows.map((r) => <EditalItem key={r.id} e={r} />);
}

async function PipelineAcoes({ e }: { e: Edital }) {
  const user = await currentUser();
  if (!user) {
    return (
      <Link className="btn btn-primary" href="/entrar">
        <Icon name="plus" size={14} /> Adicionar ao pipeline
      </Link>
    );
  }
  const [p] = await query<{ etapa: string }>(`select etapa from pipeline where user_id = $1 and edital_id = $2`, [user.id, e.id]);
  if (!p) {
    return (
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={e.id} />
        <button className="btn btn-primary">
          <Icon name="plus" size={14} /> Adicionar ao pipeline
        </button>
      </form>
    );
  }
  return (
    <form action={mudarEtapa} className="row" style={{ flexWrap: "nowrap" }}>
      <input type="hidden" name="edital" value={e.id} />
      <select className="input" name="etapa" defaultValue={p.etapa} aria-label="Etapa no pipeline" style={{ width: "auto" }}>
        {ETAPAS.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <button className="btn">Mover</button>
      <button className="btn btn-ghost btn-danger" formAction={removerDoPipeline} title="Remover do pipeline" aria-label="Remover do pipeline">
        <Icon name="trash" size={14} />
      </button>
    </form>
  );
}

async function ResumoBloco({ e }: { e: Edital }) {
  const [user, [resumo]] = await Promise.all([
    currentUser(),
    query<{ dados: Resumo; documento: string }>(`select dados, documento from resumos where edital_id = $1`, [e.id]),
  ]);
  if (!user && !resumo) {
    return (
      <div className="card card-body stack">
        <p className="muted">A IA lê o PDF do edital e extrai prazos, habilitação, exclusividade ME/EPP e pontos de atenção.</p>
        <div>
          <Link className="btn btn-primary" href="/entrar">
            <Icon name="sparkles" size={14} /> Entre para resumir
          </Link>
        </div>
      </div>
    );
  }
  return <ResumoIA editalId={e.id} inicial={resumo ? { resumo: resumo.dados, documento: resumo.documento } : null} />;
}

async function Edital({ params }: PageProps<"/edital/[id]">) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const [e] = await query<Edital>(`select * from editais where id = $1`, [id]);
  if (!e) notFound();

  return (
    <div className="page">
      <PageHead
        crumbs={
          <>
            <Link href="/buscar">Buscar</Link>/<Link href={`/orgao/${e.cnpj}`}>{nome(e.orgao)}</Link>
          </>
        }
        title={frase(e.objeto)}
        sub={
          <>
            <Link className="link" href={`/orgao/${e.cnpj}`}>
              {nome(e.orgao)}
            </Link>{" "}
            · {local(e.municipio, e.uf)} · {e.modalidade}
          </>
        }
        actions={
          <Suspense fallback={<span className="btn" style={{ width: 180 }} />}>
            <PipelineAcoes e={e} />
          </Suspense>
        }
      />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Stat label="Valor estimado" value={formatBRL(e.valor_estimado)} hint={e.srp ? "Registro de preços" : undefined} />
        <Stat label="Propostas até" value={<span style={{ fontSize: 18 }}>{formatData(e.encerramento)}</span>} hint={<PrazoBadge d={e.encerramento} />} />
        <Stat label="Abertura" value={<span style={{ fontSize: 18 }}>{formatData(e.abertura)}</span>} />
        <Stat label="Situação" value={<span style={{ fontSize: 18 }}>{e.situacao ?? "—"}</span>} hint={(e.esfera && ESFERA[e.esfera]) ?? undefined} />
      </div>

      <div className="grid cols-main">
        <div className="stack-lg">
          <section className="stack">
            <h2 className="row">
              <Icon name="sparkles" /> Resumo do edital por IA
            </h2>
            <Suspense fallback={<div className="card card-body muted">Carregando…</div>}>
              <ResumoBloco e={e} />
            </Suspense>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Detalhes</h2>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Objeto completo</dt>
                <dd>{frase(e.objeto)}</dd>
                {e.info_complementar && (
                  <>
                    <dt>Informação complementar</dt>
                    <dd>{frase(e.info_complementar)}</dd>
                  </>
                )}
                <dt>Unidade compradora</dt>
                <dd>{nome(e.unidade ?? e.orgao)}</dd>
                <dt>CNPJ do órgão</dt>
                <dd className="num">{formatCNPJ(e.cnpj)}</dd>
                <dt>Publicado no PNCP</dt>
                <dd>{formatData(e.publicado_em)}</dd>
                <dt>Nº de controle</dt>
                <dd className="mono">{e.id}</dd>
              </dl>
            </div>
          </section>
        </div>

        <aside className="stack-lg">
          <section className="card">
            <div className="card-head">
              <h2>Onde participar</h2>
            </div>
            <div className="card-body stack">
              {e.link_origem && (
                <a className="btn btn-primary" href={e.link_origem} target="_blank" rel="noreferrer">
                  Sistema de origem (enviar proposta) <Icon name="external" size={14} />
                </a>
              )}
              <a className="btn" href={pncpUrl(e)} target="_blank" rel="noreferrer">
                Ver no PNCP <Icon name="external" size={14} />
              </a>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Documentos</h2>
            </div>
            <div className="card-body">
              <Suspense fallback={<p className="small muted">Consultando o PNCP…</p>}>
                <Documentos e={e} />
              </Suspense>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Mais deste órgão</h2>
              <Link className="btn btn-sm" href={`/orgao/${e.cnpj}`}>
                Perfil
              </Link>
            </div>
            <Suspense fallback={<div className="card-body small muted">Carregando…</div>}>
              <MaisDoOrgao e={e} />
            </Suspense>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/edital/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Edital {...props} />
    </Suspense>
  );
}
