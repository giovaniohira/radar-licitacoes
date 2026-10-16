import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { query } from "@/lib/db";
import { SETORES } from "@/lib/setores";

const PLANOS = [
  { nome: "Essencial", preco: 49, itens: ["3 alertas", "1 e-mail por dia", "5 resumos de edital por IA/dia"] },
  { nome: "Profissional", preco: 99, itens: ["15 alertas", "Painel de acompanhamento", "20 resumos/dia"] },
  { nome: "Equipe", preco: 199, itens: ["Alertas ilimitados", "Até 5 usuários", "50 resumos/dia"] },
];

async function HomeConteudo() {
  await connection();
  const [stats] = await query<{ abertas: string; hoje: string }>(
    `select count(*) filter (where encerramento > now()) as abertas,
            count(*) filter (where publicado_em > now() - interval '24 hours') as hoje
     from editais`,
  );

  return (
    <main>
      <section className="hero">
        <span className="pill">Beta gratuito</span>
        <h1 style={{ marginTop: 12 }}>Os editais certos para a sua empresa, todo dia no seu e-mail.</h1>
        <p className="lead">
          O Radar lê o Portal Nacional de Contratações Públicas diariamente e avisa quando sai uma licitação que combina com o que você
          vende, na sua região e na sua faixa de valor. Sem planilha, sem ficar abrindo portal.
        </p>
        <Form action="/buscar" className="filters" style={{ gridTemplateColumns: "1fr auto", maxWidth: 640 }}>
          <label className="q">
            Experimente agora
            <input name="q" placeholder="ex.: material de limpeza, merenda escolar, notebook" />
          </label>
          <button type="submit">Buscar editais</button>
        </Form>
        <p className="muted small">
          <b>{Number(stats.abertas).toLocaleString("pt-BR")}</b> licitações com propostas abertas agora ·{" "}
          <b>{Number(stats.hoje).toLocaleString("pt-BR")}</b> publicadas nas últimas 24h
        </p>
      </section>

      <div className="grid3">
        <div className="card">
          <h3>Alertas sob medida</h3>
          <p className="muted small">Palavras-chave, setor, UF, modalidade e faixa de valor. Cada edital chega uma vez, num resumo diário.</p>
        </div>
        <div className="card">
          <h3>Resumo do edital por IA</h3>
          <p className="muted small">
            Objeto, prazos, documentos de habilitação, exclusividade ME/EPP e pontos de atenção, lidos direto do PDF.
          </p>
        </div>
        <div className="card">
          <h3>Painel de prazos</h3>
          <p className="muted small">Marque o que está em análise, preparando ou enviado e veja o que encerra nesta semana.</p>
        </div>
      </div>

      <h2>Comece por um setor</h2>
      <div className="grid3">
        {SETORES.map((s) => (
          <Link key={s.id} className="card" href={`/buscar?q=${encodeURIComponent(s.palavras)}`}>
            <h3>{s.nome}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              CNAE {s.cnae}
            </p>
          </Link>
        ))}
      </div>

      <h2>Planos</h2>
      <p className="muted">Durante o beta tudo é gratuito. Depois:</p>
      <div className="grid3">
        {PLANOS.map((p) => (
          <div key={p.nome} className="card">
            <h3>{p.nome}</h3>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              R$ {p.preco}
              <span className="muted small">/mês</span>
            </div>
            <ul className="clean muted small">
              {p.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>
        <Link className="btn" href="/entrar">
          Criar meu primeiro alerta
        </Link>
      </p>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <HomeConteudo />
    </Suspense>
  );
}
