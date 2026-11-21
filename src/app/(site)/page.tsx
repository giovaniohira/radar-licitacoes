import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { editalHref, type EditalLinha } from "@/components/ui";
import { MAX_ALERTAS } from "@/lib/alerts";
import { query } from "@/lib/db";
import { DIAS_TESTE, EMPRESA, PRECO_MENSAL } from "@/lib/empresa";
import { formatBRLCompact, formatDia, formatInt, frase, nome, tituloCurto } from "@/lib/format";
import { LIMITE_DIARIO } from "@/lib/summary";
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

const IA = [
  { t: "Objeto", d: "o que o órgão está comprando, sem o juridiquês." },
  { t: "Prazos", d: "sessão, limite da proposta e vigência." },
  { t: "Habilitação", d: "as certidões, atestados e registros que o edital exige." },
  { t: "Exclusividade ME/EPP", d: "se a disputa é reservada." },
  { t: "Garantia", d: "se pede garantia, e de quanto." },
  { t: "Pontos de atenção", d: "a amostra em 3 dias, a entrega numa cidade que você não atende." },
];

const FAQ = [
  { q: "Quanto custa?", a: `R$ ${PRECO_MENSAL}/mês, com ${DIAS_TESTE} dias grátis. Está na tela, sem "fale com o comercial".` },
  {
    q: "De onde vêm os editais?",
    a: "Do PNCP, o Portal Nacional de Contratações Públicas, que é a fonte oficial e obrigatória da Lei 14.133/2021. Órgãos federais, estaduais e municipais. O Vencedital lê o PNCP três vezes por dia.",
  },
  {
    q: "Cobre minha cidade?",
    a: "Se o órgão da sua cidade publica no PNCP, sim. Municípios pequenos que ainda só publicam em diário oficial próprio não entram, e o Vencedital não finge que entram.",
  },
  {
    q: "E se eu não souber quais palavras usar?",
    a: "Você escolhe seu setor e o Vencedital já começa com as palavras que os órgãos realmente escrevem nos editais. Antes de salvar, ele mostra quantos editais abertos aquele alerta pegaria.",
  },
  {
    q: "O resumo da IA pode errar?",
    a: "Pode. Ele serve para você decidir rápido se vale abrir o edital, não para substituir o edital. Toda tela de resumo tem o link do documento original.",
  },
  { q: "O resumo é assessoria jurídica?", a: "Não. Ele resume o edital para você decidir se vale abrir; a decisão e a proposta são suas." },
  { q: "Preciso de senha?", a: "Não. Você digita o e-mail, recebe um link e entra. Nada de senha para esquecer." },
  { q: "Vocês são do governo?", a: "Não. Os dados são públicos e vêm do PNCP; o Vencedital não tem nenhum vínculo com o governo." },
  {
    q: "Como cancelo?",
    a: `${EMPRESA.contato ? `Por e-mail para ${EMPRESA.contato}, sem multa.` : "Sem multa e sem fidelidade."} O acesso vai até o fim do mês pago.`,
  },
];

// Illustration of the Hoje screen in the hero; the real one is built from the user's data.
const MOCK = [
  { n: 1, t: "Juntar 3 documentos dos gêneros alimentícios", s: "prazo quarta, 10h", urg: true },
  { n: 2, t: "Revisar os editais novos do seu ramo", s: "chegaram desde ontem" },
  { n: 3, t: "Decidir sobre o hortifruti", s: "o resumo da IA já está pronto" },
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
          <h1>Os editais do seu ramo chegam às 7h. Já lidos.</h1>
          <p className="lead">
            Para quem vende ao governo: todo dia, as licitações novas do seu ramo e dos seus estados no e-mail, com o PDF resumido pela IA (objeto,
            prazos, habilitação, cota ME/EPP e pontos de atenção). Você decide em minutos se vale disputar.
          </p>
          <LoginForm variante="hero" />
          <p className="small subtle">{DIAS_TESTE} dias grátis. Sem senha e sem cartão: você entra pelo link que chega no e-mail.</p>
          <Link href="/buscar" className="small" style={{ fontWeight: 600 }}>
            Ver licitações abertas agora, sem cadastro →
          </Link>
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

      <section id="hoje" className="band" aria-label="Cobertura do PNCP hoje">
        <div className="container">
          <div className="spread">
            <h2>Cobertura do PNCP hoje</h2>
            <span className="small subtle">Lido três vezes por dia, de órgãos municipais, estaduais e federais.</span>
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

      <section className="container landing-sec" aria-labelledby="ia-h">
        <div className="stack" style={{ gap: 10 }}>
          <h2 id="ia-h" className="big-h">
            A IA lê o edital. Você lê o resumo.
          </h2>
          <p className="muted" style={{ fontSize: 17 }}>
            Ela abre o PDF e devolve só o que decide se você entra:
          </p>
        </div>
        <dl className="ia-lista">
          {IA.map((i) => (
            <div key={i.t}>
              <dt>{i.t}</dt>
              <dd>{i.d}</dd>
            </div>
          ))}
        </dl>
        <p className="small muted">O resumo ajuda a decidir rápido. Ele não substitui o edital, e o link do original está sempre ao lado.</p>
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
                <strong>Vencedital · hoje, 07:00</strong>
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

      <section className="container landing-sec" aria-labelledby="mercado-h">
        <h2 id="mercado-h" className="big-h">
          Antes de dar o preço, veja quem já ganhou
        </h2>
        <p className="muted" style={{ fontSize: 17, maxWidth: 640 }}>
          Cada órgão e cada fornecedor do PNCP tem uma página: o que comprou, de quem, em que faixa de valor e com que frequência.
        </p>
        <Link className="btn" href="/mercado" style={{ width: "fit-content" }}>
          Explorar o mercado →
        </Link>
      </section>

      <section id="precos" className="band" aria-labelledby="precos-h">
        <div className="container">
          <h2 id="precos-h" className="big-h">
            Preço na tela, sem falar com vendedor
          </h2>
          <div className="precos">
            <article className="card card-pad stack">
              <h3>Grátis, sem cadastro</h3>
              <p className="muted">Busca de licitações, página de cada edital e Mercado.</p>
              <Link className="btn" href="/buscar" style={{ width: "fit-content" }}>
                Ver licitações abertas
              </Link>
            </article>
            <article className="card card-pad stack destaque">
              <h3>Vencedital</h3>
              <p className="preco">
                <b className="num">R$ {PRECO_MENSAL}</b>
                <span>/mês</span>
              </p>
              <p className="muted">
                Até {MAX_ALERTAS} alertas diários, {LIMITE_DIARIO} resumos por IA por dia, Minhas disputas com checklist e prazos na sua agenda.
              </p>
              <p className="small">{DIAS_TESTE} dias grátis, sem cartão. Sem fidelidade e sem multa. Nota fiscal todo mês.</p>
              <Link className="btn btn-primary" href="/entrar" style={{ width: "fit-content" }}>
                Começar teste grátis
              </Link>
            </article>
          </div>
          <p className="small">
            <b>Preço de fundador:</b> as 10 primeiras empresas pagam R$ {PRECO_MENSAL}/mês sem reajuste, enquanto a assinatura estiver ativa. Se desistir
            em até 7 dias do primeiro pagamento, devolvemos tudo. Ao assinar, você aceita os <Link href="/termos">Termos de Uso</Link>.
          </p>
        </div>
      </section>

      <section className="container landing-sec" aria-labelledby="faq-h">
        <h2 id="faq-h" className="big-h">
          Perguntas frequentes
        </h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container cta-final">
        <p className="small muted" style={{ maxWidth: 640 }}>
          Feito por Giovani Ohira, da {EMPRESA.razaoSocial}, porque achar licitação hoje é uma planilha e muita paciência.
          {EMPRESA.contato && (
            <>
              {" "}
              Se o resumo errar ou faltar algo, escreva para <a href={`mailto:${EMPRESA.contato}`}>{EMPRESA.contato}</a>: quem responde sou eu.
            </>
          )}
        </p>
        <h2>Amanhã às 7h, os editais do seu ramo no seu e-mail.</h2>
        <p>Entre só com seu e-mail, diga o que você vende e pronto.</p>
        <Link className="btn btn-primary" href="/entrar">
          Começar teste grátis
        </Link>
      </section>
    </main>
  );
}
