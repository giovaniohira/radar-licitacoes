import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { HBars } from "@/components/charts";
import { Icon, type IconName } from "@/components/icons";
import { EditalItem, editalHref, type EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatInt, frase, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { analisar } from "@/lib/mercado";
import { SETORES } from "@/lib/setores";

const PASSOS: { titulo: string; texto: string }[] = [
  {
    titulo: "Diga o que você vende",
    texto: "Do jeito que você fala: “merenda escolar”, “reforma de telhado”. Com ou sem acento, a busca cobre todos os editais abertos do país.",
  },
  {
    titulo: "Receba só o que é novo",
    texto: "Às 7h chega um e-mail com o que saiu desde ontem. Nada repetido, nenhum portal para abrir.",
  },
  {
    titulo: "Decida sem ler o PDF inteiro",
    texto: "A IA lê o edital e mostra prazos, documentos exigidos, cota ME/EPP, garantia e o que pode desclassificar você.",
  },
  {
    titulo: "Não perca nenhum prazo",
    texto: "Cada disputa vira um card com checklist de documentos, e os prazos aparecem no seu Google Agenda.",
  },
];

const CONFIANCA: { icon: IconName; titulo: string; texto: string }[] = [
  { icon: "building", titulo: "Direto da fonte oficial", texto: "Lemos o PNCP, o portal federal de compras, 3 vezes por dia. Todo edital tem o link para o original." },
  { icon: "mail", titulo: "Sem senha", texto: "Você entra por um link de uso único no seu e-mail. Não há senha para esquecer nem para vazar." },
  { icon: "check", titulo: "CPF fica de fora", texto: "Contratos com pessoa física aparecem sem nome e sem CPF, e nunca entram em rankings." },
];

/** Recent, still-open editais with a real budget: the landing's live proof. */
async function recentes(limit: number, offset = 0) {
  return query<EditalLinha>(
    `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
     from editais where encerramento > now() + interval '2 days' and valor_estimado > 20000
     order by publicado_em desc limit $1 offset $2`,
    [limit, offset],
  );
}

async function Metricas() {
  await connection();
  const [m] = await query<{ abertas: string; hoje: string; contratos: string; orgaos: string }>(
    `select (select count(*) from editais where encerramento > now()) as abertas,
            (select count(*) from editais where publicado_em > now() - interval '24 hours') as hoje,
            (select count(*) from contratos where data_assinatura >= current_date - 30) as contratos,
            (select count(distinct cnpj) from editais where publicado_em > now() - interval '30 days') as orgaos`,
  );
  return (
    <>
      <div>
        <b>{formatInt(m.abertas)}</b>
        <span>licitações abertas agora</span>
      </div>
      <div>
        <b>{formatInt(m.hoje)}</b>
        <span>publicadas nas últimas 24h</span>
      </div>
      <div>
        <b>{formatInt(m.contratos)}</b>
        <span>contratos assinados em 30 dias</span>
      </div>
      <div>
        <b>{formatInt(m.orgaos)}</b>
        <span>órgãos comprando</span>
      </div>
    </>
  );
}

async function Previa() {
  await connection();
  const editais = await recentes(3);
  // The masthead lives here, not in the static shell, because its dateline is request time.
  const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
  return (
    <>
      <div className="previa-head">
        <span className="titulo">Editais</span>
        <span className="linha">
          <span>Informática e TI</span>
          <span>{data}, 7h</span>
        </span>
      </div>
      {editais.map((e) => (
        <Link key={e.id} href={editalHref(e.id)} className="previa-row">
          <span style={{ minWidth: 0 }}>
            <b>{tituloCurto(frase(e.objeto), 60)}</b>
            <small>
              {nome(e.orgao)}, {e.uf}
            </small>
          </span>
          <span className="r">
            <b className="num">{formatBRL(e.valor_estimado)}</b>
            <small className={prazoTom(e.encerramento) === "warn" ? "urgente" : undefined}>{prazo(e.encerramento)}</small>
          </span>
        </Link>
      ))}
    </>
  );
}

async function AoVivo() {
  await connection();
  const [editais, mercado] = await Promise.all([recentes(5, 3), analisar(pool(), { dias: 30 })]);
  return (
    <div className="grid cols-main">
      <div className="card" style={{ overflow: "hidden" }}>
        {editais.map((e) => (
          <EditalItem key={e.id} e={e} />
        ))}
      </div>
      <div className="card card-pad stack">
        <h3>Quem mais vendeu ao governo (30 dias)</h3>
        <HBars rows={mercado.fornecedores.slice(0, 8).map((f) => ({ ...f, nome: nome(f.nome) }))} href={(id) => `/fornecedor/${id}`} />
        <Link className="link small" href="/mercado">
          Ver quem compra e quem vence no seu mercado
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <p className="overline">Para empresas que vendem ao governo, em todo o Brasil</p>
          <h1>Nunca mais perca um edital que sua empresa podia ganhar.</h1>
          <p className="lead">
            Pare de garimpar portal. Às 7h, o Radar manda só os editais que combinam com o que você vende, já resumidos por IA, para você
            decidir em minutos se vale disputar.
          </p>
          <Form action="/buscar" className="hero-form">
            <label htmlFor="hero-q">O que sua empresa vende?</label>
            <div className="searchbox">
              <Icon name="search" size={20} />
              <input id="hero-q" name="q" placeholder="ex.: notebook, merenda escolar, reforma" />
              <button className="btn btn-primary">Ver editais abertos</button>
            </div>
          </Form>
          <div className="row" style={{ gap: 8 }}>
            <span className="small subtle">Ou comece pelo setor:</span>
            {SETORES.slice(0, 5).map((s) => (
              <Link key={s.id} className="chip-btn" href={`/buscar?q=${encodeURIComponent(s.palavras)}`}>
                {s.nome}
              </Link>
            ))}
            <a className="chip-btn" href="#setores">
              Mais setores
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-label="Prévia do e-mail diário">
          <div className="previa">
            <Suspense fallback={<div style={{ height: 290 }} />}>
              <Previa />
            </Suspense>
          </div>
          <div className="previa-ia">
            <span className="overline">Exemplo de resumo por IA</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="tag">Cota ME/EPP</span>
              <span className="tag">Sem garantia</span>
              <span className="tag">8 documentos</span>
            </span>
            <span className="atencao">Atenção: amostra do produto em 3 dias úteis</span>
          </div>
        </div>
      </section>

      <section className="metrics-band" aria-label="O Radar hoje">
        <div className="container metrics">
          <Suspense fallback={<div style={{ height: 88 }} />}>
            <Metricas />
          </Suspense>
        </div>
      </section>

      <section id="como" className="section container">
        <div className="section-head">
          <p className="overline">Como funciona</p>
          <h2>Do edital publicado à proposta enviada, sem planilha.</h2>
        </div>
        <div className="grid g4 passos">
          {PASSOS.map((p, i) => (
            <article key={p.titulo} className="passo">
              <span className="n">{i + 1}</span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head spread" style={{ maxWidth: "none", alignItems: "flex-end" }}>
          <div>
            <h2>O que saiu nas últimas horas</h2>
            <p>Editais e contratos reais, direto do banco do Radar. É isso que chega no seu e-mail. Nada aqui é exemplo.</p>
          </div>
          <Link className="link" href="/buscar">
            Ver todos os editais abertos
          </Link>
        </div>
        <Suspense fallback={<div className="card" style={{ height: 420 }} />}>
          <AoVivo />
        </Suspense>
      </section>

      <section id="setores" className="section container">
        <div className="section-head">
          <h2>Não sabe que palavra buscar?</h2>
          <p>Escolha seu ramo. A busca já vem com as palavras-chave que os órgãos usam, e você ajusta depois.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {SETORES.map((s) => (
            <Link key={s.id} className="chip-btn" href={`/buscar?q=${encodeURIComponent(s.palavras)}`}>
              {s.nome}
            </Link>
          ))}
        </div>
      </section>

      <section className="container confianca" aria-label="Confiança">
        {CONFIANCA.map((c) => (
          <div key={c.titulo}>
            <span className="ico">
              <Icon name={c.icon} size={17} />
            </span>
            <span>
              <h3>{c.titulo}</h3>
              <p>{c.texto}</p>
            </span>
          </div>
        ))}
      </section>

      <section className="cta-band">
        <div className="container spread">
          <div>
            <h2>Amanhã às 7h, os editais do seu ramo no seu e-mail.</h2>
            <p>Entre só com seu e-mail, sem senha, diga o que você vende e pronto.</p>
          </div>
          <Link className="btn btn-lg btn-primary" href="/entrar">
            Montar meu primeiro alerta
          </Link>
        </div>
      </section>
    </main>
  );
}
