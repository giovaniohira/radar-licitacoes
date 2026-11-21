import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { editalHref, type EditalLinha } from "@/components/ui";
import { query } from "@/lib/db";
import { formatBRLCompact, formatDia, formatInt, frase, nome, tituloCurto } from "@/lib/format";
import { LoginForm } from "../entrar/LoginForm";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const RECURSOS = [
  { t: "Receba só o que é novo", d: "Um e-mail por dia com os editais que você ainda não viu. Nada de buscar de novo amanhã." },
  { t: "Decida sem ler o PDF inteiro", d: "A IA lê o edital e responde o que importa: prazos, habilitação, cota ME/EPP e pegadinhas." },
  { t: "Não perca nenhum prazo", d: "Suas disputas num quadro, com checklist de documentos e lembrete na sua agenda." },
  { t: "Direto da fonte oficial", d: "Tudo vem do PNCP, de órgãos federais, estaduais e municipais do Brasil inteiro." },
];

const PASSOS = [
  { t: "Diga o que você vende", d: "Escolha seu ramo. A busca já vem com as palavras que os órgãos usam, e você ajusta depois." },
  { t: "Receba só o que combina", d: "Todo dia às 7h, os editais novos do seu ramo e dos seus estados no e-mail." },
  { t: "Marque o que interessa", d: "O edital vai para Minhas disputas com resumo, checklist e prazo na agenda." },
];

// Illustration of the Hoje screen in the hero; the real one is built from the user's data.
const MOCK = [
  { n: 1, t: "Juntar 3 documentos dos notebooks", s: "prazo quarta, 10h", urg: true },
  { n: 2, t: "Revisar os editais novos do seu ramo", s: "chegaram desde ontem" },
  { n: 3, t: "Decidir sobre os tablets", s: "o resumo da IA já está pronto" },
];

// The landing's numbers are cached for an hour: they barely move between ingests, and computing them
// on every visit made the first request after idle slow.
async function recentes(limit: number) {
  "use cache";
  cacheLife("hours");
  return query<EditalLinha>(
    `select id, objeto, orgao, uf, municipio, modalidade, valor_estimado::float8 as valor_estimado, encerramento
     from editais where encerramento > now() + interval '2 days' and valor_estimado > 20000
     order by publicado_em desc limit $1`,
    [limit],
  );
}

async function contagens() {
  "use cache";
  cacheLife("hours");
  const [m] = await query<{ abertas: string; hoje: string; contratos: string; orgaos: string }>(
    `select (select count(*) from editais where encerramento > now()) as abertas,
            (select count(*) from editais where publicado_em > now() - interval '24 hours') as hoje,
            (select count(*) from contratos where data_assinatura >= current_date - 30) as contratos,
            (select count(distinct cnpj) from editais where publicado_em > now() - interval '30 days') as orgaos`,
  );
  return m;
}

async function Numeros() {
  // Request-time only: the build has no database, so these must not be prerendered.
  await connection();
  const m = await contagens();
  return (
    <>
      {[
        [m.abertas, "licitações abertas agora"],
        [m.hoje, "publicadas nas últimas 24h"],
        [m.contratos, "contratos assinados em 30 dias"],
        [m.orgaos, "órgãos comprando"],
      ].map(([v, l]) => (
        <div key={l}>
          <b>{formatInt(v)}</b>
          <span>{l}</span>
        </div>
      ))}
    </>
  );
}

async function Previa() {
  await connection();
  const editais = await recentes(3);
  return editais.map((e) => (
    <Link key={e.id} href={editalHref(e.id)}>
      <b>{tituloCurto(frase(e.objeto), 70)}</b>
      <small>
        {nome(e.orgao)} · {e.uf} · {formatBRLCompact(e.valor_estimado)} · propostas até {formatDia(e.encerramento)}
      </small>
    </Link>
  ));
}

export default function Home() {
  return (
    <main id="conteudo">
      <section className="container hero">
        <div className="hero-copy">
          <h1>Nunca mais perca um edital que sua empresa podia ganhar.</h1>
          <p className="lead">Para quem vende ao governo: todo dia às 7h, os editais novos do seu ramo no seu e-mail. A IA lê o PDF por você, e o Radar lembra dos prazos.</p>
          <LoginForm variante="hero" />
          <p className="small subtle">Sem senha e sem cartão. Você entra pelo link que chega no e-mail.</p>
        </div>

        <div className="hero-mock" aria-hidden>
          <div className="xs subtle">Hoje</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 650, letterSpacing: "-0.02em" }}>Bom dia. Você tem 3 coisas pra hoje.</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {MOCK.map((t) => (
              <div key={t.n} className={`task${t.urg ? " urg" : ""}`}>
                <span className="n">{t.n}</span>
                <div className="body" style={{ flexBasis: 0, flexGrow: 1 }}>
                  <div className="t">{t.t}</div>
                  <p>{t.s}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="card card-pad stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6, fontSize: 12, fontWeight: 600, color: "var(--brand-text)" }}>
              <Icon name="sparkle" size={14} /> Resumo por IA
            </div>
            <div className="small" style={{ fontWeight: 600 }}>
              Tem alguma pegadinha?
            </div>
            <div className="small muted">Amostra do produto em até 3 dias úteis após a convocação.</div>
          </div>
        </div>
      </section>

      <section id="hoje" className="band" aria-label="O Radar hoje">
        <div className="container">
          <div className="spread">
            <h2>O Radar hoje</h2>
            <span className="small subtle">Números reais, direto do banco do Radar, atualizados todo dia.</span>
          </div>
          <div className="numeros">
            <Suspense fallback={<div style={{ height: 88 }} />}>
              <Numeros />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="container landing-sec">
        <h2 className="big-h">Do edital publicado à proposta enviada, sem planilha.</h2>
        <div className="recursos">
          {RECURSOS.map((r) => (
            <article key={r.t}>
              <h3>{r.t}</h3>
              <p>{r.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="como" className="band como">
        <div className="container">
          <div className="como-passos">
            <h2>Do cadastro ao primeiro e-mail em três passos</h2>
            {PASSOS.map((p, i) => (
              <div key={p.t} className="p">
                <span className="n">{i + 1}</span>
                <div>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              </div>
            ))}
          </div>
          <div id="email" className="email-previa">
            <div className="h">
              <div>
                <strong>Radar · hoje, 07:00</strong>
              </div>
              <div>Editais novos para o seu ramo</div>
            </div>
            <Suspense fallback={<div style={{ height: 210 }} />}>
              <Previa />
            </Suspense>
            <div className="f">Prévia do e-mail diário, com editais reais abertos agora</div>
          </div>
        </div>
      </section>

      <section className="container cta-final">
        <h2>Amanhã às 7h, os editais do seu ramo no seu e-mail.</h2>
        <p>Entre só com seu e-mail, diga o que você vende e pronto.</p>
        <Link className="btn btn-primary" href="/entrar">
          Começar agora
        </Link>
      </section>
    </main>
  );
}
