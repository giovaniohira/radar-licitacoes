import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Icon, Mark } from "@/components/icons";
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

const seta = <Icon name="arrowRight" size={15} className="arr" />;

/** Section label: "01 — Como funciona". */
function Kicker({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="kicker">
      <span className="idx">{n}</span>
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <main id="conteudo">
      {/* Ink block: promise, sign-up, product preview and today's live PNCP numbers. */}
      <section className="hero on-ink">
        <div className="container">
          <p className="kicker rise">Alerta diário de licitações do PNCP</p>
          <h1 className="display hero-h rise d1">
            Os editais do seu ramo chegam às 7h. <em>Já lidos.</em>
          </h1>

          <div className="hero-grid">
            <div className="hero-copy rise d2">
              <p className="lead">
                Para quem vende ao governo: todo dia, as licitações novas do seu ramo e dos seus estados no e-mail, com o PDF resumido pela IA (objeto,
                prazos, habilitação, cota ME/EPP e pontos de atenção). Você decide em minutos se vale disputar.
              </p>
              <LoginForm variante="hero" />
              <p className="hero-nota">{DIAS_TESTE} dias grátis. Sem senha e sem cartão: você entra pelo link que chega no e-mail.</p>
              <Link href="/buscar" className="link-arr">
                Ver licitações abertas agora, sem cadastro {seta}
              </Link>
            </div>

            <div className="hero-mock rise d3" aria-hidden>
              <div className="mock-bar">
                <span>Hoje</span>
                <span>07:00</span>
              </div>
              <div className="mock-body">
                <div className="mock-h">Bom dia. Você tem 3 coisas pra hoje.</div>
                <div className="card">
                  {MOCK.map((t) => (
                    <div key={t.n} className={`task${t.urg ? " urg" : ""}`}>
                      <span className="n">{t.n}</span>
                      <div className="body">
                        <div className="t">{t.t}</div>
                        <p>{t.s}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card mock-ia">
                  <div className="k">
                    <Icon name="sparkle" size={13} /> Resumo por IA
                  </div>
                  <b>Tem alguma pegadinha?</b>
                  <p>Amostra do produto em até 3 dias úteis após a convocação.</p>
                </div>
              </div>
            </div>
          </div>

          <div id="hoje" className="cobertura" role="region" aria-labelledby="hoje-h">
            <div className="cob-head">
              <h2 id="hoje-h" className="kicker vivo">
                Cobertura do PNCP hoje
              </h2>
              <span>Lido três vezes por dia, de órgãos municipais, estaduais e federais.</span>
            </div>
            <div className="numeros">
              <Suspense fallback={<div className="numeros-sk" />}>
                <Numeros />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      <section id="como" className="sec" aria-labelledby="como-h">
        <div className="container">
          <div className="sec-head">
            <Kicker n="01">Como funciona</Kicker>
            <h2 id="como-h" className="display sec-h">
              Do cadastro ao primeiro e-mail em três passos
            </h2>
          </div>
          <div className="como-grid">
            <ol className="passos">
              {PASSOS.map((p, i) => (
                <li key={p.t} className="reveal">
                  <span className="n">0{i + 1}</span>
                  <div>
                    <h3>{p.t}</h3>
                    <p>{p.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div id="email" className="email-previa reveal">
              <div className="h">
                <span className="av" aria-hidden>
                  <Mark size={14} />
                </span>
                <div>
                  <strong>Vencedital · hoje, 07:00</strong>
                  <div>Editais novos para o seu ramo</div>
                </div>
              </div>
              <Suspense fallback={<div style={{ height: 210 }} />}>
                <Previa />
              </Suspense>
              <div className="f">Prévia do e-mail diário, com editais reais abertos agora</div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec on-ink" aria-labelledby="ia-h">
        <div className="container">
          <div className="sec-head split">
            <div>
              <Kicker n="02">Resumo por IA</Kicker>
              <h2 id="ia-h" className="display sec-h">
                A IA lê o edital. <em>Você lê o resumo.</em>
              </h2>
            </div>
            <p className="sec-sub">Ela abre o PDF e devolve só o que decide se você entra:</p>
          </div>
          <dl className="ia-grid">
            {IA.map((i) => (
              <div key={i.t} className="reveal">
                <dt>{i.t}</dt>
                <dd>{i.d}</dd>
              </div>
            ))}
          </dl>
          <p className="sec-foot">O resumo ajuda a decidir rápido. Ele não substitui o edital, e o link do original está sempre ao lado.</p>
        </div>
      </section>

      <section className="sec sec-white" aria-labelledby="rec-h">
        <div className="container">
          <div className="sec-head">
            <Kicker n="03">Recursos</Kicker>
            <h2 id="rec-h" className="display sec-h">
              Do edital publicado à proposta enviada, sem planilha.
            </h2>
          </div>
          <div className="recursos">
            {RECURSOS.map((r, i) => (
              <article key={r.t} className="reveal">
                <span className="n">0{i + 1}</span>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-sand" aria-labelledby="mercado-h">
        <div className="container mercado">
          <div>
            <Kicker n="04">Mercado</Kicker>
            <h2 id="mercado-h" className="display sec-h">
              Antes de dar o preço, veja quem já ganhou
            </h2>
          </div>
          <div className="mercado-body">
            <p>Cada órgão e cada fornecedor do PNCP tem uma página: o que comprou, de quem, em que faixa de valor e com que frequência.</p>
            <Link className="link-arr" href="/mercado">
              Explorar o mercado {seta}
            </Link>
          </div>
        </div>
      </section>

      <section id="precos" className="sec" aria-labelledby="precos-h">
        <div className="container">
          <div className="sec-head">
            <Kicker n="05">Preços</Kicker>
            <h2 id="precos-h" className="display sec-h">
              Preço na tela, sem falar com vendedor
            </h2>
          </div>
          <div className="precos">
            <article className="plano">
              <h3>Grátis, sem cadastro</h3>
              <p className="preco">
                <b className="num">R$ 0</b>
              </p>
              <p className="desc">Busca de licitações, página de cada edital e Mercado.</p>
              <Link className="btn btn-lg" href="/buscar">
                Ver licitações abertas {seta}
              </Link>
            </article>
            <article className="plano destaque on-ink">
              <div className="plano-top">
                <h3>Vencedital</h3>
                <span className="selo">Preço de fundador</span>
              </div>
              <p className="preco">
                <b className="num">R$ {PRECO_MENSAL}</b>
                <span>/mês</span>
              </p>
              <ul className="inclui">
                <li>Até {MAX_ALERTAS} alertas diários</li>
                <li>{LIMITE_DIARIO} resumos por IA por dia</li>
                <li>Minhas disputas com checklist</li>
                <li>Prazos na sua agenda</li>
              </ul>
              <p className="desc">{DIAS_TESTE} dias grátis, sem cartão. Sem fidelidade e sem multa. Nota fiscal todo mês.</p>
              <Link className="btn btn-light btn-lg" href="/entrar">
                Começar teste grátis {seta}
              </Link>
            </article>
          </div>
          <p className="fundador">
            <b>Preço de fundador:</b> as 10 primeiras empresas pagam R$ {PRECO_MENSAL}/mês sem reajuste, enquanto a assinatura estiver ativa. Se desistir
            em até 7 dias do primeiro pagamento, devolvemos tudo. Ao assinar, você aceita os <Link href="/termos">Termos de Uso</Link>.
          </p>
        </div>
      </section>

      <section className="sec sec-white" aria-labelledby="faq-h">
        <div className="container faq-grid">
          <div className="faq-side">
            <Kicker n="06">Dúvidas</Kicker>
            <h2 id="faq-h" className="display sec-h">
              Perguntas frequentes
            </h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-final on-ink">
        <div className="container">
          <h2 className="display">
            Amanhã às 7h, os editais do seu ramo <em>no seu e-mail.</em>
          </h2>
          <div className="cta-row">
            <p>Entre só com seu e-mail, diga o que você vende e pronto.</p>
            <Link className="btn btn-light btn-lg" href="/entrar">
              Começar teste grátis {seta}
            </Link>
          </div>
          <p className="assinatura">
            Feito por Giovani Ohira, da {EMPRESA.razaoSocial}, porque achar licitação hoje é uma planilha e muita paciência.
            {EMPRESA.contato && (
              <>
                {" "}
                Se o resumo errar ou faltar algo, escreva para <a href={`mailto:${EMPRESA.contato}`}>{EMPRESA.contato}</a>: quem responde sou eu.
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
