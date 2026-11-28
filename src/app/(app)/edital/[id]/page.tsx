import { Suspense, cache, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { SubmitButton } from "@/components/SubmitButton";
import { Loading, PrazoPill, editalHref, type EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatCNPJ, formatData, frase, local, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { fetchArquivos, pncpUrl, type EditalRow } from "@/lib/pncp";
import { cardDetalhe, type Etapa } from "@/lib/pipeline";
import { siteUrl, trilha } from "@/lib/schema";
import { tituloEdital } from "@/lib/seo";
import { currentUser } from "@/lib/session";
import type { Resumo } from "@/lib/summary";
import { adicionarAoPipeline, mudarEtapa, removerDoPipeline } from "../../../actions/pipeline";
import { Checklist, Notas } from "./Disputa";
import { QuemJaGanhou } from "./QuemGanhou";
import { ResumoIA } from "./ResumoIA";

type Edital = EditalRow & { valor_estimado: string | null };

// Shared by the page and its metadata so the row is read once per request.
const getEdital = cache(async (id: string) => (await query<Edital>(`select * from editais where id = $1`, [id]))[0]);

export async function generateMetadata({ params }: PageProps<"/edital/[id]">): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  const e = await getEdital(id);
  // A real 404 for crawlers that get the metadata before the body (see htmlLimitedBots); the page body keeps its own notFound().
  if (!e) notFound();
  // What is bought and where: the same object text is repeated across buyers, the place is what tells the pages apart.
  const lugar = local(e.municipio, e.uf) || nome(e.orgao);
  const title = `${tituloEdital(e.objeto, 60)} · ${lugar}`;
  const description = [
    `${nome(e.orgao)}${e.uf ? `, ${e.uf}` : ""}`,
    `Valor estimado: ${formatBRL(e.valor_estimado)}`,
    `Propostas até ${formatData(e.encerramento)}`,
  ].join(". ");
  return { title, description, alternates: { canonical: editalHref(id) }, openGraph: { title, description } };
}

const TZ = "America/Sao_Paulo";
const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short" });
const horaMin = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
/** "qua 18 nov, 10h". */
function quando(d: string | Date | null) {
  if (!d) return "—";
  const x = new Date(d);
  return `${diaSemana.format(x).replace(".", "")} ${diaMes.format(x).replace(" de ", " ").replace(".", "")}, ${horaMin.format(x).replace(":00", "h").replace(":", "h")}`;
}

const PASSOS: { id: Etapa; label: string }[] = [
  { id: "triagem", label: "Triagem" },
  { id: "analise", label: "Em análise" },
  { id: "preparando", label: "Preparando proposta" },
  { id: "enviada", label: "Enviada" },
];

function EtapaForm({ id, etapa, children, primaria }: { id: string; etapa: Etapa; children: ReactNode; primaria?: boolean }) {
  return (
    <form action={mudarEtapa}>
      <input type="hidden" name="edital" value={id} />
      <input type="hidden" name="etapa" value={etapa} />
      <SubmitButton className={`btn${primaria ? " btn-primary" : ""}`}>{children}</SubmitButton>
    </form>
  );
}

/** Stage bar plus the one thing to do next, with the buttons that do it. */
function Disputa({ e, etapa, faltam, logado }: { e: Edital; etapa?: Etapa; faltam: number; logado: boolean }) {
  const idx = !etapa ? -1 : etapa === "ganha" || etapa === "perdida" ? 4 : PASSOS.findIndex((p) => p.id === etapa);
  const cls = (i: number) => (i < idx || (i === 4 && idx === 4) ? "feito" : i === idx ? "atual" : undefined);
  const resultado = etapa === "ganha" ? "Ganha" : etapa === "perdida" ? "Perdida" : "Resultado";
  const ate = quando(e.encerramento);

  let texto: string;
  let botoes: ReactNode;
  if (!logado) {
    texto = "Decida se vale disputar este edital.";
    botoes = (
      <Link className="btn btn-primary" href="/entrar">
        Entre para acompanhar
      </Link>
    );
  } else if (!etapa) {
    texto = "Decida se vale disputar este edital.";
    botoes = (
      <>
        <form action={adicionarAoPipeline}>
          <input type="hidden" name="edital" value={e.id} />
          <SubmitButton className="btn btn-primary">Tenho interesse</SubmitButton>
        </form>
        <form action={adicionarAoPipeline}>
          <input type="hidden" name="edital" value={e.id} />
          <input type="hidden" name="etapa" value="descartada" />
          <SubmitButton className="btn">Não é pra mim</SubmitButton>
        </form>
      </>
    );
  } else if (etapa === "triagem") {
    texto = "Leia o resumo e decida se vale disputar.";
    botoes = (
      <>
        <EtapaForm id={e.id} etapa="analise" primaria>
          Vou disputar
        </EtapaForm>
        <EtapaForm id={e.id} etapa="descartada">
          Descartar
        </EtapaForm>
      </>
    );
  } else if (etapa === "analise") {
    texto = "Confira a habilitação e peça cotações aos fornecedores.";
    botoes = (
      <>
        <EtapaForm id={e.id} etapa="preparando" primaria>
          Começar a proposta
        </EtapaForm>
        <EtapaForm id={e.id} etapa="descartada">
          Descartar
        </EtapaForm>
      </>
    );
  } else if (etapa === "preparando") {
    texto = faltam > 0 ? `Junte ${faltam === 1 ? "o documento que falta" : `os ${faltam} documentos que faltam`} até ${ate}.` : `Documentos prontos. Envie a proposta até ${ate}.`;
    botoes = (
      <>
        {faltam > 0 ? (
          <a className="btn btn-primary" href="#checklist">
            Ir para o checklist
          </a>
        ) : (
          e.link_origem && (
            <a className="btn btn-primary" href={e.link_origem} target="_blank" rel="noreferrer">
              Enviar no portal <Icon name="external" size={14} />
            </a>
          )
        )}
        <EtapaForm id={e.id} etapa="enviada">
          Marcar como enviada
        </EtapaForm>
      </>
    );
  } else if (etapa === "enviada") {
    texto = "Acompanhe a sessão no portal e registre o resultado aqui.";
    botoes = (
      <>
        <EtapaForm id={e.id} etapa="ganha" primaria>
          Ganhamos
        </EtapaForm>
        <EtapaForm id={e.id} etapa="perdida">
          Perdemos
        </EtapaForm>
      </>
    );
  } else if (etapa === "ganha") {
    texto = "Contrato ganho. Fique de olho na assinatura e no empenho.";
    botoes = null;
  } else if (etapa === "perdida") {
    texto = "Veja quem costuma vencer neste órgão para a próxima disputa.";
    botoes = (
      <Link className="btn" href={`/orgao/${e.cnpj}`}>
        Ver o órgão
      </Link>
    );
  } else {
    texto = "Você descartou este edital.";
    botoes = (
      <EtapaForm id={e.id} etapa="triagem">
        Desfazer
      </EtapaForm>
    );
  }

  return (
    <section className="card disputa" aria-label="Disputa">
      <ol aria-label="Etapas da disputa" className="stepper">
        {PASSOS.map((p, i) => {
          const conteudo = (
            <>
              <i />
              <span>
                {cls(i) === "feito" && "✓ "}
                {p.label}
              </span>
            </>
          );
          return (
            <li key={p.id} className={cls(i)}>
              {etapa && etapa !== p.id ? (
                <form action={mudarEtapa} style={{ display: "contents" }}>
                  <input type="hidden" name="edital" value={e.id} />
                  <input type="hidden" name="etapa" value={p.id} />
                  <button aria-label={`Mover para ${p.label}`}>{conteudo}</button>
                </form>
              ) : (
                conteudo
              )}
            </li>
          );
        })}
        <li className={cls(4)}>
          <i />
          <span>
            {idx === 4 && "✓ "}
            {resultado}
          </span>
        </li>
      </ol>
      <div className="guide">
        <Icon name="arrowRight" size={20} />
        <div className="body">
          <div className="k">Próximo passo</div>
          <div className="t">{texto}</div>
        </div>
        {botoes}
      </div>
    </section>
  );
}

async function Documentos({ e }: { e: Edital }) {
  let arquivos: Awaited<ReturnType<typeof fetchArquivos>> = [];
  try {
    arquivos = (await fetchArquivos(e, { retries: 1 })).filter((a) => a.statusAtivo);
  } catch {
    return <p className="card-body small muted">O PNCP não respondeu agora. Veja os documentos direto no portal.</p>;
  }
  if (!arquivos.length) return <p className="card-body small muted">Nenhum documento publicado no PNCP.</p>;
  return arquivos.map((a) => (
    <div key={a.sequencialDocumento} className="file">
      <span className="ext">{(a.titulo.match(/\.(\w{2,4})$/)?.[1] ?? "PDF").toUpperCase().slice(0, 4)}</span>
      <div className="nm">
        <b title={a.titulo}>{a.titulo}</b>
        {a.tipoDocumentoNome && <small>{a.tipoDocumentoNome}</small>}
      </div>
      <a className="small" href={a.url} target="_blank" rel="noreferrer">
        Baixar
      </a>
    </div>
  ));
}

async function MaisDoOrgao({ e }: { e: Edital }) {
  const rows = await query<EditalLinha>(
    `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
     from editais where cnpj = $1 and id <> $2 and encerramento > now() order by encerramento limit 4`,
    [e.cnpj, e.id],
  );
  if (!rows.length) return <p className="small muted">Este órgão não tem outros editais abertos agora.</p>;
  return rows.map((r) => (
    <div key={r.id} style={{ display: "grid", gap: 4 }}>
      <Link href={editalHref(r.id)} className="small" style={{ color: "var(--text)", fontWeight: 550 }}>
        {tituloCurto(frase(r.objeto), 70)}
      </Link>
      <span>
        <PrazoPill d={r.encerramento} />
      </span>
    </div>
  ));
}

async function Edital({ params }: PageProps<"/edital/[id]">) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const e = await getEdital(id);
  if (!e) notFound();
  const user = await currentUser();
  const [[p], [resumo]] = await Promise.all([
    user ? query<{ etapa: Etapa; valor_proposta: number | null }>(`select etapa, valor_proposta::float8 as valor_proposta from pipeline where user_id = $1 and edital_id = $2`, [user.id, e.id]) : Promise.resolve([]),
    query<{ dados: Resumo; documento: string }>(`select dados, documento from resumos where edital_id = $1`, [e.id]),
  ]);
  const det = user && p ? await cardDetalhe(pool(), user.id, e.id) : null;
  const faltam = det ? det.checklist.filter((c) => !c.feito).length : 0;

  const objeto = frase(e.objeto);
  const titulo = tituloCurto(objeto);
  const aberto = !!e.encerramento && prazo(e.encerramento) !== "encerrado";
  const urgente = prazoTom(e.encerramento) === "warn";
  const unidade = e.unidade && nome(e.unidade) !== nome(e.orgao) ? nome(e.unidade) : null;

  const detalhes = (
    <details>
      <summary>Ver objeto completo e todos os detalhes</summary>
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
        <dt>Situação</dt>
        <dd>{e.situacao ?? "—"}</dd>
        <dt>Publicado no PNCP</dt>
        <dd>{formatData(e.publicado_em)}</dd>
        <dt>Nº de controle</dt>
        <dd>{e.id}</dd>
      </dl>
    </details>
  );

  return (
    <div className="page" style={{ gap: 20 }}>
      <JsonLd data={trilha(siteUrl(), [{ nome: "Encontrar editais", path: "/buscar" }, { nome: tituloEdital(e.objeto, 80), path: editalHref(e.id) }])} />
      <nav className="crumbs" aria-label="Você está em">
        {p ? <Link href="/pipeline">Minhas disputas</Link> : <Link href="/buscar">Encontrar editais</Link>}
        <span>/</span>
        <span>{e.modalidade ?? "Edital"}</span>
      </nav>

      <header className="edital-head">
        <div>
          <div className="pills">
            {aberto ? <span className="pill ok">Aberto</span> : <span className="pill">Encerrado</span>}
            {e.modalidade && <span className="pill">{e.modalidade}</span>}
            {e.srp && <span className="pill">Registro de preços</span>}
            {resumo?.dados.exclusivo_me_epp && <span className="pill">Cota ME/EPP</span>}
          </div>
          <h1>{titulo}</h1>
          <p>
            <Link href={`/orgao/${e.cnpj}`}>{nome(e.orgao)}</Link>
            {e.uf && ` · ${e.uf}`}
            {unidade && ` · ${unidade}`}
          </p>
        </div>
        <div className="row">
          <a className="btn" href={pncpUrl(e)} target="_blank" rel="noreferrer">
            Abrir no PNCP
          </a>
          {(e.link_origem || p) && (
            <details className="menu">
              <summary className="btn btn-icon" aria-label="Mais ações">
                ···
              </summary>
              <div className="menu-pop">
                {e.link_origem && (
                  <a className="btn btn-ghost" href={e.link_origem} target="_blank" rel="noreferrer">
                    Enviar proposta no portal <Icon name="external" size={14} />
                  </a>
                )}
                {p && (
                  <form action={removerDoPipeline}>
                    <input type="hidden" name="edital" value={e.id} />
                    <SubmitButton className="btn btn-ghost" style={{ color: "var(--danger)", width: "100%", justifyContent: "flex-start" }}>
                      Remover de Minhas disputas
                    </SubmitButton>
                  </form>
                )}
              </div>
            </details>
          )}
        </div>
      </header>

      <Disputa e={e} etapa={p?.etapa} faltam={faltam} logado={!!user} />

      <section aria-label="Dados principais" className="card facts">
        <div>
          <span>Valor estimado</span>
          <b>{formatBRL(e.valor_estimado)}</b>
          {e.srp && <small>registro de preços, por demanda</small>}
        </div>
        <div className={urgente ? "urg" : undefined}>
          <span>Propostas até</span>
          <b>{quando(e.encerramento)}</b>
          <small>{prazo(e.encerramento).replace(/^em /, "faltam ")}</small>
        </div>
        <div>
          <span>Abertura das propostas</span>
          <b>{quando(e.abertura)}</b>
        </div>
        <div>
          <span>{resumo ? "Ganha quem" : "Situação"}</span>
          <b style={{ fontSize: 17 }}>{resumo ? resumo.dados.criterio_julgamento : (e.situacao ?? "—")}</b>
        </div>
      </section>

      <Suspense fallback={<section className="card card-pad" style={{ minHeight: 96 }}><p className="small muted">Buscando contratos parecidos deste órgão…</p></section>}>
        <QuemJaGanhou cnpj={e.cnpj} objeto={e.objeto} excluir={`${e.orgao} ${e.municipio ?? ""} ${e.unidade ?? ""}`} uf={e.uf} esfera={e.esfera} />
      </Suspense>

      <div className="cols">
        <div className="col-main">
          <ResumoIA editalId={e.id} logado={!!user} inicial={resumo ? { resumo: resumo.dados, documento: resumo.documento } : null} detalhes={detalhes} />
          <section className="card" style={{ overflow: "hidden" }}>
            <div className="card-head">
              <h2>Arquivos do edital</h2>
            </div>
            <Suspense fallback={<p className="card-body small muted">Consultando o PNCP…</p>}>
              <Documentos e={e} />
            </Suspense>
          </section>
        </div>

        <aside className="col-side">
          {det ? (
            <>
              <Checklist editalId={e.id} inicial={det.checklist} temResumo={!!resumo} />
              <Notas editalId={e.id} inicial={det.notas} valorProposta={p?.valor_proposta ?? null} valorEstimado={e.valor_estimado} />
            </>
          ) : (
            <section className="card card-pad stack">
              <div className="card-title">
                <h2>Mais deste órgão</h2>
                <Link href={`/orgao/${e.cnpj}`}>Ver órgão</Link>
              </div>
              <Suspense fallback={<p className="small muted">Carregando…</p>}>
                <MaisDoOrgao e={e} />
              </Suspense>
            </section>
          )}
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
