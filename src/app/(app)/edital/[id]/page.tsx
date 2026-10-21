import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { AutoSelect } from "@/components/AutoSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { EditalItem, Loading, type EditalLinha } from "@/components/ui";
import { query } from "@/lib/db";
import { formatBRL, formatCNPJ, formatData, frase, local, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
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
  if (!rows.length) return <div className="card-body small muted">Este órgão não tem outros editais abertos agora.</div>;
  return rows.map((r) => <EditalItem key={r.id} e={r} />);
}

async function PipelineAcoes({ e }: { e: Edital }) {
  const user = await currentUser();
  if (!user) {
    return (
      <Link className="btn" href="/entrar">
        <Icon name="plus" size={14} /> Acompanhar no pipeline
      </Link>
    );
  }
  const [p] = await query<{ etapa: string }>(`select etapa from pipeline where user_id = $1 and edital_id = $2`, [user.id, e.id]);
  if (!p) {
    return (
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={e.id} />
        <SubmitButton className="btn" style={{ width: "100%" }}>
          <Icon name="plus" size={14} /> Acompanhar no pipeline
        </SubmitButton>
      </form>
    );
  }
  return (
    <form action={mudarEtapa} className="field">
      <span>Etapa no pipeline</span>
      <input type="hidden" name="edital" value={e.id} />
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {/* Keyed by stage: React resets the form after the action, and the reset must land on the saved value. */}
        <AutoSelect key={p.etapa} className="input" name="etapa" defaultValue={p.etapa} aria-label="Etapa no pipeline">
          {ETAPAS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </AutoSelect>
        <details className="menu">
          <summary className="btn btn-icon" aria-label="Mais ações" title="Mais ações">
            ⋯
          </summary>
          <div className="menu-pop">
            <button className="btn btn-ghost btn-danger" formAction={removerDoPipeline}>
              <Icon name="trash" size={14} /> Remover do pipeline
            </button>
          </div>
        </details>
      </div>
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
      <div className="card card-body stack resumo-cta">
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

  const objeto = frase(e.objeto);
  const titulo = tituloCurto(objeto);
  return (
    <div className="page">
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/buscar">Buscar</Link>/<Link href={`/orgao/${e.cnpj}`}>{nome(e.orgao)}</Link>
      </nav>
      <header className="edital-head">
        <div className="stack" style={{ gap: 10, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            {e.modalidade && <span className="tag outline">{e.modalidade}</span>}
            {e.srp && <span className="tag outline">Registro de preços</span>}
            {e.esfera && ESFERA[e.esfera] && <span className="tag outline">{ESFERA[e.esfera]}</span>}
          </div>
          <h1>{titulo}</h1>
          {titulo !== objeto && (
            <p className="clamp2 subtle" title={objeto} style={{ maxWidth: 780 }}>
              {objeto}
            </p>
          )}
          <p className="small muted">
            <Icon name="building" size={14} />{" "}
            <Link className="link" href={`/orgao/${e.cnpj}`}>
              {nome(e.orgao)}
            </Link>{" "}
            · {local(e.municipio, e.uf)}
          </p>
        </div>
        <div className="edital-acoes">
          <Suspense fallback={<span className="btn" style={{ width: "100%" }} />}>
            <PipelineAcoes e={e} />
          </Suspense>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            {e.link_origem && (
              <a className="btn btn-primary" style={{ flex: 1 }} href={e.link_origem} target="_blank" rel="noreferrer">
                Enviar proposta no portal <Icon name="external" size={14} />
              </a>
            )}
            <a className="btn" style={e.link_origem ? undefined : { flex: 1 }} href={pncpUrl(e)} target="_blank" rel="noreferrer">
              Ver no PNCP <Icon name="external" size={14} />
            </a>
          </div>
        </div>
      </header>

      <section className="card facts" aria-label="Fatos principais">
        <div>
          <span>Valor estimado</span>
          <b>{formatBRL(e.valor_estimado)}</b>
          <small>{e.srp ? "Registro de preços, por demanda" : "Total estimado"}</small>
        </div>
        <div>
          <span>Propostas até</span>
          <b>{formatData(e.encerramento)}</b>
          <small className={prazoTom(e.encerramento) === "warn" ? "urgente" : undefined}>{prazo(e.encerramento)}</small>
        </div>
        <div>
          <span>Abertura</span>
          <b>{formatData(e.abertura)}</b>
          <small>Publicado no PNCP em {formatData(e.publicado_em)}</small>
        </div>
        <div>
          <span>Situação</span>
          <b>{e.situacao ?? "—"}</b>
          <small>{(e.esfera && ESFERA[e.esfera]) ?? "—"}</small>
        </div>
      </section>

      <div className="grid cols-main">
        <div className="stack-lg">
          <Suspense fallback={<div className="card card-body muted">Carregando o resumo…</div>}>
            <ResumoBloco e={e} />
          </Suspense>
          <section className="card">
            <div className="card-head">
              <h2>Detalhes</h2>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Objeto completo</dt>
                <dd>{objeto}</dd>
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
                <dt>Nº de controle</dt>
                <dd className="mono">{e.id}</dd>
              </dl>
            </div>
          </section>
        </div>

        <aside className="rail">
          <section className="card">
            <h2>Arquivos</h2>
            <Suspense fallback={<p className="small muted">Consultando o PNCP…</p>}>
              <Documentos e={e} />
            </Suspense>
          </section>
          <section className="card" style={{ padding: 0, gap: 0 }}>
            <div className="card-head">
              <h2>Mais deste órgão</h2>
              <Link className="link small" href={`/orgao/${e.cnpj}`}>
                Ver perfil
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
