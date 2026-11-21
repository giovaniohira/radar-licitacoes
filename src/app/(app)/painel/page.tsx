import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { EditalRow, EditalRows, Empty, Interesse, Loading, editalHref } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRLCompact, formatInt, frase, horasAtras, nome, prazoTom, tituloCurto } from "@/lib/format";
import { first } from "@/lib/params";
import { ETAPAS, etapaLabel, listPipeline, vencendo, type Etapa, type PipelineItem } from "@/lib/pipeline";
import { buildSearch, type EditalResumo } from "@/lib/search";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Hoje", robots: { index: false } };

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
const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric" });
const horaMin = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const chaveDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const horaBR = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });

const plural = (n: number, um: string, varios: string) => `${formatInt(n)} ${n === 1 ? um : varios}`;
const sem = (d: Date) => diaSemana.format(d).replace(".", "");
/** "10h" or "10h30", the way people say a deadline. */
const hora = (d: Date) => horaMin.format(d).replace(":00", "h").replace(":", "h");
const curto = (objeto: string) => tituloCurto(frase(objeto), 52);
const EM_DISPUTA: Etapa[] = ["triagem", "analise", "preparando", "enviada"];

interface Tarefa {
  titulo: string;
  tag?: string;
  texto: string;
  acao: string;
  href: string;
  urgente?: boolean;
  primaria?: boolean;
}

/** Up to three things to do today, read from deadlines, new matches and the setup steps still open. */
function tarefasDoDia(itens: PipelineItem[], novos: { alert: AlertRow; total: number }[], passos: { label: string; href: string; feito: boolean; texto: string; acao: string }[]): Tarefa[] {
  const out: Tarefa[] = [];
  for (const i of vencendo(itens, 7).filter((x) => x.etapa !== "triagem").slice(0, 2)) {
    const d = new Date(i.encerramento!);
    const falta = i.check_total - i.check_feito;
    out.push(
      falta > 0
        ? {
            titulo: `Juntar ${plural(falta, "documento", "documentos")} de ${curto(i.objeto)}`,
            tag: `prazo ${sem(d)}, ${hora(d)}`,
            texto: `Já tem ${i.check_feito} de ${i.check_total}. ${nome(i.orgao)}.`,
            acao: "Abrir checklist",
            href: `${editalHref(i.edital_id)}#checklist`,
            urgente: prazoTom(d) === "warn",
          }
        : {
            titulo: `Enviar a proposta de ${curto(i.objeto)}`,
            tag: `prazo ${sem(d)}, ${hora(d)}`,
            texto: `${etapaLabel(i.etapa)} · ${nome(i.orgao)}.`,
            acao: "Abrir edital",
            href: editalHref(i.edital_id),
            urgente: prazoTom(d) === "warn",
          },
    );
  }
  const totalNovos = novos.reduce((s, n) => s + n.total, 0);
  if (totalNovos > 0) {
    out.push({
      titulo: totalNovos === 1 ? "Revisar o edital novo" : `Revisar os ${formatInt(totalNovos)} editais novos`,
      texto: `${novos
        .filter((n) => n.total > 0)
        .map((n) => `${formatInt(n.total)} de ${n.alert.nome}`)
        .join(", ")} ${totalNovos === 1 ? "chegou" : "chegaram"} nas últimas 24h.`,
      acao: "Revisar",
      href: "#novos",
    });
  }
  const decidir = vencendo(itens, 30).find((x) => x.etapa === "triagem");
  if (decidir) {
    const d = new Date(decidir.encerramento!);
    out.push({
      titulo: `Decidir se disputa ${curto(decidir.objeto)}`,
      tag: `decidir até ${sem(d)}`,
      texto: "Está em Triagem. Leia o resumo e escolha se vale disputar.",
      acao: "Ler resumo",
      href: editalHref(decidir.edital_id),
    });
  }
  for (const p of passos.filter((x) => !x.feito)) out.push({ titulo: p.label, texto: p.texto, acao: p.acao, href: p.href });
  const tres = out.slice(0, 3);
  if (tres[0]) tres[0].primaria = true;
  return tres;
}

function Semana({ itens }: { itens: PipelineItem[] }) {
  const hoje = new Date();
  const dias = Array.from({ length: 5 }, (_, k) => new Date(hoje.getTime() + k * 86_400_000));
  const ativos = itens.filter((i) => i.encerramento && ["triagem", "analise", "preparando"].includes(i.etapa));
  return (
    <section className="card card-pad stack" style={{ gap: 6 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        <h2>Sua semana</h2>
        <Link href="/conta#agenda">Sincronizar agenda</Link>
      </div>
      <div className="semana">
        {dias.map((d, k) => {
          const doDia = ativos
            .filter((i) => chaveDia.format(new Date(i.encerramento!)) === chaveDia.format(d))
            .sort((a, b) => new Date(a.encerramento!).getTime() - new Date(b.encerramento!).getTime());
          const p = doDia[0];
          const label = `${sem(d).replace(/^./, (c) => c.toUpperCase())} ${diaMes.format(d)}`;
          return (
            <div key={k} className={`dia${p ? (prazoTom(p.encerramento) === "warn" ? " urg" : " tem") : ""}`}>
              <b>{label}</b>
              {p ? (
                <Link href={editalHref(p.edital_id)}>
                  {hora(new Date(p.encerramento!))} · {tituloCurto(frase(p.objeto), 34)}, {nome(p.orgao).split(" ").slice(-1)}
                  {doDia.length > 1 && ` +${doDia.length - 1}`}
                </Link>
              ) : (
                <span>Nada vencendo</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmDisputa({ itens }: { itens: PipelineItem[] }) {
  const etapas = ETAPAS.filter((e) => EM_DISPUTA.includes(e.id)).map((e) => {
    const lista = itens.filter((i) => i.etapa === e.id);
    return { ...e, n: lista.length, valor: lista.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0) };
  });
  const total = etapas.reduce((s, e) => s + e.valor, 0);
  const ganhas = itens.filter((i) => i.etapa === "ganha").length;
  const perdidas = itens.filter((i) => i.etapa === "perdida").length;
  const ativos = etapas.reduce((s, e) => s + e.n, 0);
  return (
    <section className="card card-pad stack">
      <div className="card-title">
        <h2>Em disputa</h2>
        <Link href="/pipeline">{plural(ativos, "edital", "editais")}</Link>
      </div>
      <div className="big">{formatBRLCompact(total) === "—" ? "R$ 0" : formatBRLCompact(total)}</div>
      {total > 0 && (
        <div className="stack-bar" role="img" aria-label={etapas.map((e) => `${e.label} ${Math.round((e.valor / total) * 100)}%`).join(", ")}>
          {etapas.map((e) => e.valor > 0 && <i key={e.id} className={`e-${e.id}`} style={{ width: `${(e.valor / total) * 100}%` }} />)}
        </div>
      )}
      <div className="legend">
        {etapas.map((e) => (
          <div key={e.id} style={{ display: "contents" }}>
            <i className={`e-${e.id}`} />
            <span className="l">{e.label}</span>
            <span className="n">{e.n}</span>
            <span className="v">{formatBRLCompact(e.valor)}</span>
          </div>
        ))}
      </div>
      {(ganhas > 0 || perdidas > 0) && (
        <p className="small muted num" style={{ paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          Resultado até agora: {plural(ganhas, "ganho", "ganhos")}, {plural(perdidas, "perdido", "perdidos")}
        </p>
      )}
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
    .flatMap((n) => n.rows)
    .filter((e) => !vistos.has(e.id) && vistos.add(e.id))
    .sort((a, b) => new Date(b.publicado_em ?? 0).getTime() - new Date(a.publicado_em ?? 0).getTime())
    .slice(0, 10);
  const etapaDe = new Map(itens.map((i) => [i.edital_id, i.etapa]));
  const proximoEmail = Number(horaBR.format(new Date())) < 7 ? "hoje, 7h" : "amanhã, 7h";

  const passos = [
    { label: "Criar seu primeiro alerta", texto: "Diga o que você vende e os editais novos chegam aqui e no e-mail das 7h.", acao: "Criar alerta", href: "/boas-vindas", feito: alerts.length > 0 },
    { label: "Marcar um edital que interessa", texto: "Na busca, clique em Tenho interesse: ele entra em Minhas disputas.", acao: "Encontrar editais", href: "/buscar", feito: itens.length > 0 },
    ...(process.env.ANTHROPIC_API_KEY
      ? [{ label: "Ler o resumo por IA de um edital", texto: "A IA lê o PDF e responde o que importa: prazos, documentos e pegadinhas.", acao: "Abrir edital", href: itens[0] ? editalHref(itens[0].edital_id) : "/buscar", feito: resumiu }]
      : []),
  ];
  const tarefas = tarefasDoDia(itens, novos, passos);
  const hh = Number(horaBR.format(new Date()));
  const saudacao = hh < 12 ? "Bom dia" : hh < 18 ? "Boa tarde" : "Boa noite";
  const data = dataExtensa.format(new Date());

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{data.charAt(0).toUpperCase() + data.slice(1)}</p>
          <h1>
            {saudacao}. {tarefas.length ? `Você tem ${tarefas.length} ${tarefas.length === 1 ? "coisa" : "coisas"} pra hoje.` : "Tudo em dia por hoje."}
          </h1>
        </div>
        <Link className="btn" href="/alertas">
          <Icon name="plus" size={15} /> Novo alerta
        </Link>
      </header>
      {first(sp.bemvindo) && (
        <div className="notice ok">
          <b>Tudo pronto.</b> Seu alerta já está ativo: os editais novos aparecem aqui, e o primeiro e-mail sai {proximoEmail}.
        </div>
      )}

      {tarefas.length > 0 && (
        <section aria-label="Para fazer hoje" className="card" style={{ overflow: "hidden" }}>
          {tarefas.map((t, i) => (
            <div key={t.titulo} className={`task${t.urgente ? " urg" : ""}`}>
              <span className="n">{i + 1}</span>
              <div className="body">
                <span className="t">{t.titulo}</span>
                {t.tag && <span className={`pill${t.urgente ? " urg" : ""}`}>{t.tag}</span>}
                <p>{t.texto}</p>
              </div>
              <Link className={`btn${t.primaria ? " btn-primary" : ""}`} href={t.href}>
                {t.acao}
              </Link>
            </div>
          ))}
        </section>
      )}

      <div className="cols">
        <section id="novos" className="card col-main" style={{ overflow: "hidden", gap: 0 }}>
          <div className="erows-head">
            <div className="card-title">
              <h2>Novos para você</h2>
              <Link href={atual ? `/buscar?q=${encodeURIComponent(atual.alert.palavras)}&ordem=recentes` : "/buscar?ordem=recentes"}>Ver todos</Link>
            </div>
            <p>Diga se interessa. O que você marcar vai para Minhas disputas.</p>
          </div>
          {alerts.length > 0 && (
            <nav className="tabs" aria-label="Filtrar por alerta">
              <Link href="/painel#novos" scroll={false} aria-current={atual ? undefined : "true"}>
                Todos · {formatInt(totalNovos)}
              </Link>
              {novos.map((n) => (
                <Link key={n.alert.id} href={`/painel?alerta=${n.alert.id}#novos`} scroll={false} aria-current={n === atual ? "true" : undefined}>
                  {n.alert.nome} · {formatInt(n.total)}
                </Link>
              ))}
            </nav>
          )}
          {alerts.length === 0 ? (
            <Empty title="Nenhum alerta ativo">
              <Link href="/boas-vindas">Crie um alerta</Link> e os editais novos aparecem aqui e no seu e-mail das 7h.
            </Empty>
          ) : linhas.length === 0 ? (
            <Empty title="Nada novo nas últimas 24h">Seus alertas são verificados 3 vezes por dia. O próximo e-mail sai {proximoEmail}.</Empty>
          ) : (
            <EditalRows>
              {linhas.map((e) => (
                <EditalRow key={e.id} e={e} apagado={etapaDe.get(e.id) === "descartada"} acoes={<Interesse id={e.id} etapa={etapaDe.get(e.id)} />} />
              ))}
            </EditalRows>
          )}
        </section>

        <aside className="col-side" aria-label="Sua semana e disputas">
          <Semana itens={itens} />
          <EmDisputa itens={itens} />
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
