import { Suspense, type ReactNode } from "react";
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
import { entrarDemo } from "../actions/auth";

const PASSOS: { titulo: string; texto: string; demo: ReactNode }[] = [
  {
    titulo: "Diga o que você vende",
    texto: "Busca em português, sem se preocupar com acento, em todos os editais abertos do país.",
    demo: (
      <>
        <span className="mini-input">notebook, impressora, toner</span>
        <span className="row" style={{ gap: 6 }}>
          <span className="tag outline">SP, PR, SC</span>
          <span className="tag outline">até R$ 500 mil</span>
        </span>
      </>
    ),
  },
  {
    titulo: "Receba só o que é novo",
    texto: "Um e-mail por dia, às 7h, sem repetir edital que você já viu.",
    demo: (
      <>
        <span className="mini-mail">
          <span className="mono">07:00</span> Editais novos para você
        </span>
        <span className="mini-mail" style={{ opacity: 0.55 }}>
          <span className="mono">ontem</span> Editais novos para você
        </span>
      </>
    ),
  },
  {
    titulo: "Entenda o edital sem ler o PDF",
    texto: "A IA aponta prazos, documentos, cota ME/EPP, garantia e as armadilhas para empresa pequena.",
    demo: (
      <>
        <span className="row" style={{ gap: 6 }}>
          <span className="tag accent">Cota ME/EPP</span>
          <span className="tag outline">Garantia</span>
        </span>
        <span className="small" style={{ color: "var(--warn)", fontWeight: 550 }}>
          Pontos de atenção
        </span>
        <span className="small muted">Documentos de habilitação</span>
      </>
    ),
  },
  {
    titulo: "Acompanhe até o resultado",
    texto: "Pipeline com checklist de documentos e os prazos direto no seu Google Agenda.",
    demo: (
      <span className="mini-board">
        {["Triagem", "Proposta", "Ganha"].map((c, i) => (
          <span key={c}>
            <b className={i === 2 ? "ok" : undefined}>{c}</b>
            <i className={i === 2 ? "ok" : undefined} />
            {i === 0 && <i />}
          </span>
        ))}
      </span>
    ),
  },
];

const CONFIANCA: { icon: IconName; titulo: string; texto: string }[] = [
  { icon: "building", titulo: "Dados oficiais do PNCP", texto: "Lemos o portal federal 3 vezes por dia. Cada edital tem o link para a fonte." },
  { icon: "mail", titulo: "Entrar sem senha", texto: "Um link de uso único no seu e-mail. Nada para decorar ou vazar." },
  { icon: "check", titulo: "Privacidade de pessoa física", texto: "Contratos com pessoa física ficam sem CPF e sem nome, e nunca entram em rankings." },
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
  return editais.map((e) => (
    <Link key={e.id} href={editalHref(e.id)} className="previa-row">
      <span style={{ minWidth: 0 }}>
        <b>{tituloCurto(frase(e.objeto), 60)}</b>
        <small>
          {nome(e.orgao)} · {e.uf}
        </small>
      </span>
      <span className="r">
        <b className="num">{formatBRL(e.valor_estimado)}</b>
        <small className={prazoTom(e.encerramento) === "warn" ? "urgente" : undefined}>{prazo(e.encerramento)}</small>
      </span>
    </Link>
  ));
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
          Ver o mercado completo
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
          <span className="eyebrow">
            <span className="live-dot" /> Ao vivo do PNCP · atualizado 3 vezes por dia
          </span>
          <h1>Os editais que sua empresa pode ganhar, no seu e-mail às 7h.</h1>
          <p className="lead">
            O Radar lê o Portal Nacional de Contratações Públicas, resume cada edital com IA e organiza suas propostas até o resultado.
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
          <svg className="rings" viewBox="0 0 520 520" aria-hidden="true">
            <circle cx="260" cy="260" r="80" />
            <circle cx="260" cy="260" r="150" />
            <circle cx="260" cy="260" r="220" />
            <path d="M260 260 L415 105" />
          </svg>
          <div className="previa">
            <div className="previa-head">
              <span className="brand-mark">
                <Icon name="radar" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>Editais novos para Informática e TI</b>
                <small>Radar · hoje, 07:00</small>
              </span>
              <span className="tag accent">E-mail</span>
            </div>
            <Suspense fallback={<div style={{ height: 210 }} />}>
              <Previa />
            </Suspense>
          </div>
          <div className="previa-ia">
            <span className="row" style={{ gap: 8, color: "var(--sidebar-accent)", fontWeight: 600 }}>
              <Icon name="sparkles" size={15} /> Exemplo de resumo por IA
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="tag">Cota ME/EPP</span>
              <span className="tag">Sem garantia</span>
              <span className="tag">8 documentos</span>
            </span>
            <span style={{ color: "#f7c9a6" }}>Atenção: amostra do produto em 3 dias úteis</span>
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
          <p className="overline" style={{ color: "var(--accent-text)" }}>
            Como funciona
          </p>
          <h2>Do edital publicado à proposta enviada.</h2>
        </div>
        <div className="grid g4 passos">
          {PASSOS.map((p, i) => (
            <article key={p.titulo} className="card passo">
              <span className="mono subtle">0{i + 1}</span>
              <div className="passo-demo">{p.demo}</div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head spread" style={{ maxWidth: "none", alignItems: "flex-end" }}>
          <div>
            <h2>Publicados nas últimas horas</h2>
            <p>Editais e contratos reais, direto do banco do Radar. Nada aqui é exemplo.</p>
          </div>
          <Link className="link" href="/buscar">
            Ver todos os editais abertos →
          </Link>
        </div>
        <Suspense fallback={<div className="card" style={{ height: 420 }} />}>
          <AoVivo />
        </Suspense>
      </section>

      <section id="setores" className="section container">
        <div className="section-head">
          <h2>Comece pelo seu setor</h2>
          <p>Palavras-chave prontas por ramo. Edite à vontade depois.</p>
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
            <h2>Veja o Radar com dados de verdade.</h2>
            <p>A demo já vem com alertas e um pipeline montados. Sem cadastro.</p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <form action={entrarDemo}>
              <button className="btn btn-lg cta-claro">
                Abrir a demo <Icon name="arrowRight" />
              </button>
            </form>
            <Link className="btn btn-lg cta-contorno" href="/entrar">
              Criar minha conta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
