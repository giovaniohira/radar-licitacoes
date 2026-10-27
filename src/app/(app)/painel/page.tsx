import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { EditalItem, Empty, Loading, editalHref } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRLCompact, formatDiaCurto, formatInt, frase, horasAtras, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { first } from "@/lib/params";
import { ETAPAS, etapaLabel, listPipeline, vencendo, type Etapa, type PipelineItem } from "@/lib/pipeline";
import { buildSearch, type EditalResumo } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { adicionarAoPipeline, removerDoPipeline } from "../../actions/pipeline";

export const metadata: Metadata = { title: "Hoje" };

interface AlertRow {
  id: number;
  nome: string;
  palavras: string;
  ufs: string[];
  modalidades: number[];
  valor_min: string | null;
  valor_max: string | null;
}

const TZ = "America/Sao_Paulo";
const dataExtensa = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const horaBR = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });

const plural = (n: number, um: string, varios: string) => `${formatInt(n)} ${n === 1 ? um : varios}`;
const EM_DISPUTA: Etapa[] = ["triagem", "analise", "preparando", "enviada"];

/** Acompanhar / Descartar on an untouched row; the current stage (with undo for discards) once it is in the pipeline. */
function Triagem({ id, etapa }: { id: string; etapa?: Etapa }) {
  if (etapa === "descartada") {
    return (
      <form action={removerDoPipeline} className="row" style={{ gap: 4 }}>
        <input type="hidden" name="edital" value={id} />
        <span className="xs subtle">Descartado</span>
        <SubmitButton className="btn btn-ghost btn-sm">Desfazer</SubmitButton>
      </form>
    );
  }
  if (etapa) {
    return (
      <Link className="tag accent" href="/pipeline">
        <Icon name="check" size={13} />
        {etapaLabel(etapa)}
      </Link>
    );
  }
  return (
    <>
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={id} />
        <SubmitButton className="btn btn-sm">
          <Icon name="plus" size={14} /> Acompanhar
        </SubmitButton>
      </form>
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={id} />
        <input type="hidden" name="etapa" value="descartada" />
        <SubmitButton className="btn btn-ghost btn-sm btn-icon" aria-label="Descartar" title="Descartar">
          <Icon name="x" size={16} />
        </SubmitButton>
      </form>
    </>
  );
}

function Prazos({ itens }: { itens: PipelineItem[] }) {
  const dias = new Map<string, PipelineItem[]>();
  for (const i of vencendo(itens)) {
    const d = new Date(i.encerramento!);
    const k = `${diaSemana.format(d).replace(".", "")}, ${formatDiaCurto(d)}`;
    dias.set(k, [...(dias.get(k) ?? []), i]);
  }
  return (
    <section className="card">
      <div className="spread">
        <h2>Prazos da semana</h2>
        <Link className="link small" href="/pipeline">
          Ver no pipeline
        </Link>
      </div>
      {dias.size === 0 && <p className="small subtle">Nenhum prazo do pipeline nos próximos 7 dias.</p>}
      {[...dias].map(([dia, lista]) => (
        <div key={dia} className="stack" style={{ gap: 10 }}>
          <div className={`dia${prazoTom(lista[0].encerramento) === "warn" ? " urgente" : ""}`}>
            <span>{dia}</span>
            <span>{prazo(lista[0].encerramento)}</span>
          </div>
          {lista.map((i) => (
            <Link key={i.edital_id} href={editalHref(i.edital_id)} className="prazo-item">
              <span className="hora">{hora.format(new Date(i.encerramento!))}</span>
              <span style={{ minWidth: 0 }}>
                <span className="t">{tituloCurto(frase(i.objeto))}</span>
                <span className="m">
                  {nome(i.orgao)} · {formatBRLCompact(i.valor_proposta ?? i.valor_estimado)}
                </span>
                <span className={`tag${i.etapa === "preparando" ? " accent" : ""}`}>
                  {etapaLabel(i.etapa)}
                  {i.check_total > 0 && ` · ${i.check_feito} de ${i.check_total} docs`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}

/** Setup checklist for new accounts; every item is read from data the user already created, and the card goes away once all are done. */
function PrimeirosPassos({ passos }: { passos: { label: string; href: string; feito: boolean }[] }) {
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;
  return (
    <section className="card">
      <div className="spread">
        <h2>Primeiros passos</h2>
        <span className="xs subtle num">
          {feitos} de {passos.length}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>
      <ol className="primeiros">
        {passos.map((p) => (
          <li key={p.label} className={p.feito ? "feito" : undefined}>
            <span className="marca">{p.feito && <Icon name="check" size={12} />}</span>
            {p.feito ? <span>{p.label}</span> : <Link href={p.href}>{p.label}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EmDisputa({ itens }: { itens: PipelineItem[] }) {
  const etapas = ETAPAS.filter((e) => EM_DISPUTA.includes(e.id)).map((e) => {
    const lista = itens.filter((i) => i.etapa === e.id);
    return { ...e, n: lista.length, valor: lista.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0) };
  });
  const total = etapas.reduce((s, e) => s + e.valor, 0);
  const ativos = etapas.reduce((s, e) => s + e.n, 0);
  const ganhas = itens.filter((i) => i.etapa === "ganha").length;
  const perdidas = itens.filter((i) => i.etapa === "perdida").length;
  return (
    <section className="card">
      <div className="spread">
        <h2>Em disputa</h2>
        <Link className="link small" href="/pipeline">
          Abrir pipeline
        </Link>
      </div>
      <div>
        <div className="big">{formatBRLCompact(total)}</div>
        <p className="small subtle" style={{ marginTop: 4 }}>
          {plural(ativos, "edital ativo", "editais ativos")} · {plural(ganhas, "ganho", "ganhos")} e {plural(perdidas, "perdido", "perdidos")} até agora
        </p>
      </div>
      {total > 0 && (
        <div className="stack-bar" role="img" aria-label={etapas.map((e) => `${e.label}: ${Math.round((e.valor / total) * 100)}%`).join(", ")}>
          {etapas.map((e) => e.valor > 0 && <i key={e.id} className={`e-${e.id}`} style={{ width: `${(e.valor / total) * 100}%` }} />)}
        </div>
      )}
      <div className="legend">
        {etapas.map((e) => (
          <div key={e.id} style={{ display: "contents" }}>
            <i className={`e-${e.id}`} />
            <span className="muted">{e.label}</span>
            <span className="subtle">{e.n}</span>
            <span className="v">{formatBRLCompact(e.valor)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/painel">, "searchParams">) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const aba = first(sp.alerta);
  const [itens, alerts, [{ resumiu }]] = await Promise.all([
    listPipeline(pool(), user.id),
    query<AlertRow>(`select id, nome, palavras, ufs, modalidades, valor_min, valor_max from alerts where user_id = $1 and ativo order by id`, [user.id]),
    query<{ resumiu: boolean }>(`select exists (select 1 from pipeline p join resumos r using (edital_id) where p.user_id = $1) as resumiu`, [user.id]),
  ]);

  // New matches per alert in the last 24h, same query the daily digest uses.
  const desde = horasAtras(24);
  const novos = await Promise.all(
    alerts.map(async (a) => {
      const { sql, params } = buildSearch(
        {
          palavras: a.palavras,
          ufs: a.ufs,
          modalidades: a.modalidades,
          valorMin: a.valor_min == null ? null : Number(a.valor_min),
          valorMax: a.valor_max == null ? null : Number(a.valor_max),
          desde,
          ordem: "recentes",
        },
        { limit: 8 },
      );
      const rows = await query<EditalResumo>(sql, params);
      return { alert: a, rows, total: Number(rows[0]?.total ?? 0) };
    }),
  );

  const totalNovos = novos.reduce((s, n) => s + n.total, 0);
  const atual = novos.find((n) => String(n.alert.id) === aba);
  const vistos = new Set<string>();
  const linhas = (atual ? [atual] : novos)
    .flatMap((n) => n.rows.map((e) => ({ e, alerta: n.alert })))
    .filter(({ e }) => !vistos.has(e.id) && vistos.add(e.id))
    .sort((a, b) => new Date(b.e.publicado_em ?? 0).getTime() - new Date(a.e.publicado_em ?? 0).getTime())
    .slice(0, 10);
  const etapaDe = new Map(itens.map((i) => [i.edital_id, i.etapa]));
  const urgentes = vencendo(itens, 4).length;
  const proximoEmail = Number(horaBR.format(new Date())) < 7 ? "hoje, 7h" : "amanhã, 7h";
  const passos = [
    { label: "Criar seu primeiro alerta", href: "/boas-vindas", feito: alerts.length > 0 },
    { label: "Acompanhar um edital", href: "/buscar", feito: itens.length > 0 },
    ...(process.env.ANTHROPIC_API_KEY
      ? [{ label: "Ler o resumo por IA de um edital que você acompanha", href: itens[0] ? editalHref(itens[0].edital_id) : "/buscar", feito: resumiu }]
      : []),
    { label: "Levar um edital para Em análise no pipeline", href: "/pipeline", feito: itens.some((i) => i.etapa !== "triagem" && i.etapa !== "descartada") },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow-date">{dataExtensa.format(new Date())}</p>
          <h1>Hoje</h1>
          <p className="resumo">
            {alerts.length === 0 ? (
              "Crie um alerta para receber os editais novos aqui e no seu e-mail."
            ) : (
              <>
                {totalNovos ? <b>{plural(totalNovos, "edital novo", "editais novos")}</b> : "Nenhum edital novo"} nos seus alertas
                {urgentes ? (
                  <>
                    {" "}
                    e <b className="urgente">{plural(urgentes, "prazo", "prazos")}</b> do pipeline nos próximos 3 dias.
                  </>
                ) : (
                  ". Nenhum prazo do pipeline nos próximos 3 dias."
                )}
              </>
            )}
          </p>
        </div>
        <Link className="btn" href="/alertas">
          <Icon name="plus" size={14} /> Novo alerta
        </Link>
      </div>
      {first(sp.bemvindo) && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          <b>Tudo pronto.</b> Seu alerta já está ativo: os editais novos aparecem aqui, e o primeiro e-mail com os abertos que combinam com ele sai {proximoEmail}.
        </div>
      )}

      <div className="grid cols-main">
        <section className="card inbox" aria-labelledby="inbox-h" style={{ overflow: "hidden" }}>
          <div className="inbox-head">
            <h2 id="inbox-h">
              Novos nos seus alertas <span className="subtle" style={{ fontWeight: 500 }}>· últimas 24h</span>
            </h2>
          </div>
          {alerts.length > 1 && (
            <nav className="tabs" aria-label="Filtrar por alerta">
              <Link href="/painel" scroll={false} aria-current={atual ? undefined : "true"}>
                Todos<span className="count">{formatInt(totalNovos)}</span>
              </Link>
              {novos.map((n) => (
                <Link key={n.alert.id} href={`/painel?alerta=${n.alert.id}`} scroll={false} aria-current={n === atual ? "true" : undefined}>
                  {n.alert.nome}
                  <span className="count">{formatInt(n.total)}</span>
                </Link>
              ))}
            </nav>
          )}
          {alerts.length === 0 ? (
            <Empty title="Nenhum alerta ativo">
              <Link className="link" href="/boas-vindas">
                Crie um alerta
              </Link>{" "}
              e os editais novos aparecem aqui e no seu e-mail das 7h.
            </Empty>
          ) : linhas.length === 0 ? (
            <Empty title="Nada novo nas últimas 24h">Seus alertas são verificados 3 vezes por dia. O próximo e-mail sai {proximoEmail}.</Empty>
          ) : (
            <>
              {linhas.map(({ e, alerta }) => (
                <EditalItem
                  key={e.id}
                  e={e}
                  termos={alerta.palavras}
                  extra={!atual && alerts.length > 1 && <span className="tag accent">{alerta.nome}</span>}
                  apagado={etapaDe.get(e.id) === "descartada"}
                  acoes={<Triagem id={e.id} etapa={etapaDe.get(e.id)} />}
                />
              ))}
              <div className="inbox-foot">
                <span>
                  Mostrando {formatInt(linhas.length)} de {formatInt(atual ? atual.total : totalNovos)}
                </span>
                {atual ? (
                  <Link className="link" href={`/buscar?q=${encodeURIComponent(atual.alert.palavras)}&ordem=recentes`}>
                    Ver todos na busca
                  </Link>
                ) : (
                  <Link className="link" href="/alertas">
                    Gerenciar alertas
                  </Link>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="rail" aria-label="Pipeline">
          <PrimeirosPassos passos={passos} />
          <Prazos itens={itens} />
          <EmDisputa itens={itens} />
          <section className="card mail-card">
            <span className="ico">
              <Icon name="mail" size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 600 }}>
                Próximo e-mail: {proximoEmail}
              </div>
              <div className="xs subtle">{alerts.length ? `${plural(alerts.length, "alerta ativo", "alertas ativos")}, só com editais inéditos` : "Nenhum alerta ativo"}</div>
            </div>
            <Link className="link small" href="/alertas">
              Gerenciar
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Painel({ searchParams }: PageProps<"/painel">) {
  return (
    <Suspense fallback={<Loading />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}
