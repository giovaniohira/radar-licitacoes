import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { HBars } from "@/components/charts";
import { Icon, type IconName } from "@/components/icons";
import { EditalItem, type EditalLinha } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatInt, nome } from "@/lib/format";
import { analisar } from "@/lib/mercado";
import { SETORES } from "@/lib/setores";
import { entrarDemo } from "../actions/auth";

const PILARES: { icon: IconName; titulo: string; texto: string }[] = [
  {
    icon: "search",
    titulo: "Encontre",
    texto: "Busca em português sem acento sobre todo o PNCP, atualizada três vezes por dia. Salve qualquer busca como alerta e receba só o que é novo.",
  },
  {
    icon: "sparkles",
    titulo: "Entenda o edital",
    texto: "A IA lê o PDF e devolve prazos, documentos de habilitação, exclusividade ME/EPP, garantia e as armadilhas para uma empresa pequena.",
  },
  {
    icon: "kanban",
    titulo: "Acompanhe",
    texto: "Pipeline de propostas da triagem ao resultado, com checklist de documentos e os prazos direto no seu Google Agenda.",
  },
  {
    icon: "chart",
    titulo: "Conheça o mercado",
    texto: "Quem compra o que você vende, quem ganha e por quanto, a partir de todos os contratos assinados e publicados no PNCP.",
  },
];

async function Metricas() {
  await connection();
  const [m] = await query<{ abertas: string; hoje: string; contratos: string; orgaos: string }>(
    `select (select count(*) from editais where encerramento > now()) as abertas,
            (select count(*) from editais where publicado_em > now() - interval '24 hours') as hoje,
            (select count(*) from contratos where data_assinatura >= current_date - 30) as contratos,
            (select count(distinct cnpj) from editais where publicado_em > now() - interval '30 days') as orgaos`,
  );
  return (
    <div className="metrics">
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
        <span>contratos analisados (30 dias)</span>
      </div>
      <div>
        <b>{formatInt(m.orgaos)}</b>
        <span>órgãos comprando</span>
      </div>
    </div>
  );
}

async function AoVivo() {
  await connection();
  const [editais, mercado] = await Promise.all([
    query<EditalLinha>(
      `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
       from editais where encerramento > now() + interval '2 days' and valor_estimado > 20000
       order by publicado_em desc limit 5`,
    ),
    analisar(pool(), { dias: 30 }),
  ]);
  return (
    <div className="grid g2">
      <div className="card preview">
        <div className="card-head">
          <h2>Publicados agora</h2>
          <Link className="btn btn-sm" href="/buscar">
            Ver todos
          </Link>
        </div>
        {editais.map((e) => (
          <EditalItem key={e.id} e={e} />
        ))}
      </div>
      <div className="card preview">
        <div className="card-head">
          <h2>Quem mais vendeu ao governo (30 dias)</h2>
          <Link className="btn btn-sm" href="/mercado">
            Mercado
          </Link>
        </div>
        <div className="card-body">
          <HBars rows={mercado.fornecedores.slice(0, 8).map((f) => ({ ...f, nome: nome(f.nome) }))} href={(id) => `/fornecedor/${id}`} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <section className="hero container">
        <span className="eyebrow">
          <span className="live-dot" /> Dados do PNCP atualizados todo dia
        </span>
        <h1>
          Encontre, acompanhe e ganhe <em>licitações públicas</em>.
        </h1>
        <p className="lead">
          O Radar lê o Portal Nacional de Contratações Públicas, avisa quando sai o edital certo para a sua empresa, resume o PDF com IA e
          organiza suas propostas até o resultado.
        </p>
        <Form action="/buscar">
          <label className="sr-only" htmlFor="hero-q">
            O que sua empresa vende?
          </label>
          <input id="hero-q" className="input input-lg" name="q" placeholder="O que você vende? ex.: notebook, merenda escolar, reforma" />
          <button className="btn btn-primary btn-lg">
            <Icon name="search" /> Buscar editais
          </button>
        </Form>
        <Suspense fallback={<div className="metrics" style={{ height: 59 }} />}>
          <Metricas />
        </Suspense>
      </section>

      <section className="section container">
        <div className="grid g4 pillars">
          {PILARES.map((p) => (
            <div key={p.titulo} className="card pillar">
              <span className="icon">
                <Icon name={p.icon} />
              </span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <h2>Ao vivo, direto do PNCP</h2>
          <p>Nada aqui é mock: são os editais e contratos que entraram no banco nas últimas horas.</p>
        </div>
        <Suspense fallback={<div className="card" style={{ height: 420 }} />}>
          <AoVivo />
        </Suspense>
      </section>

      <section className="section container">
        <div className="section-head">
          <h2>Comece pelo seu setor</h2>
          <p>Presets de palavras-chave por ramo. Edite à vontade depois.</p>
        </div>
        <div className="row">
          {SETORES.map((s) => (
            <Link key={s.id} className="btn" href={`/buscar?q=${encodeURIComponent(s.palavras)}`}>
              {s.nome}
            </Link>
          ))}
        </div>
      </section>

      <section className="container">
        <div className="card cta">
          <h2>Veja o Radar funcionando</h2>
          <p>A conta demo já tem um pipeline montado e alertas configurados. Sem cadastro.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <form action={entrarDemo}>
              <button className="btn btn-primary btn-lg">
                Abrir a demo <Icon name="arrowRight" />
              </button>
            </form>
            <Link className="btn btn-lg" href="/entrar">
              Criar minha conta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
