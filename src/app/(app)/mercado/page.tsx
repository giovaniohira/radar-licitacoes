import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Bars, HBars } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Empty, Kpi, Loading, PageHead } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatInt, nome } from "@/lib/format";
import { PERIODOS, analisar } from "@/lib/mercado";
import { first, withParams } from "@/lib/params";
import { buildSearch } from "@/lib/search";
import { SETORES, UFS } from "@/lib/setores";

export const metadata: Metadata = { title: "Mercado" };

// One analysis reads ~500k contracts and takes ~30 s on the production database (0.5 CPU). Contracts only
// change at the 06h ingest, so each filter combination is cached for an hour and refreshed in the background:
// visitors get the cached figures instead of waiting. CI warms the default view after each deploy.
async function analise(q: string, uf: string, dias: number) {
  "use cache";
  cacheLife("hours");
  const abertos = buildSearch({ palavras: q, ufs: uf ? [uf] : [] }, { limit: 1 });
  const [m, [aberto]] = await Promise.all([analisar(pool(), { q, uf, dias }), query<{ total: string }>(abertos.sql, abertos.params)]);
  return { m, nAbertos: Number(aberto?.total ?? 0) };
}

async function Mercado({ searchParams }: PageProps<"/mercado">) {
  await connection();
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 300);
  const uf = first(sp.uf);
  const dias = PERIODOS.find((p) => String(p) === first(sp.dias)) ?? 90;
  const { m, nAbertos } = await analise(q, uf, dias);
  const buscaHref = `/buscar?q=${encodeURIComponent(q)}${uf ? `&uf=${uf}` : ""}`;
  const mediana = m.totais.mediana;
  const topo = m.orgaos[0];

  return (
    <div className="page" style={{ gap: 20 }}>
      <PageHead title="Mercado" sub="Contratos publicados no PNCP: quem compra, quem vence e por quanto." />

      <Form action="/mercado" className="card card-pad stack">
        <input type="hidden" name="dias" value={dias} />
        <div className="row" style={{ alignItems: "stretch" }}>
          <label className="searchbox" style={{ flexBasis: 320 }}>
            <Icon name="search" size={18} />
            <span className="sr-only">Qual mercado?</span>
            <input name="q" defaultValue={q} placeholder="Qual mercado? ex.: notebook, merenda escolar, pavimentação" />
          </label>
          <label>
            <span className="sr-only">Estado</span>
            <select className="input input-lg" name="uf" defaultValue={uf} style={{ width: "auto", height: "100%" }}>
              <option value="">Brasil</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <div className="seg lg" aria-label="Período">
            {PERIODOS.map((p) => (
              <Link key={p} href={`/mercado${withParams(sp, { dias: String(p) })}`} aria-current={p === dias ? "true" : undefined}>
                {p === 365 ? "12 meses" : `${p} dias`}
              </Link>
            ))}
          </div>
          <button className="sr-only">Analisar</button>
        </div>
        <div className="row small" style={{ gap: 6 }}>
          <span className="muted">Setores:</span>
          {SETORES.map((s) => (
            <Link key={s.id} className="chip-link" href={`/mercado?q=${encodeURIComponent(s.palavras)}&dias=${dias}${uf ? `&uf=${uf}` : ""}`}>
              {s.nome}
            </Link>
          ))}
        </div>
      </Form>

      {m.totais.contratos === 0 ? (
        <div className="card">
          <Empty title="Nenhum contrato encontrado no período">Tente outras palavras, outro estado ou um período maior.</Empty>
        </div>
      ) : (
        <>
          <div className="guide">
            <Icon name="sparkle" size={20} />
            <p className="body" style={{ fontSize: 14, color: "var(--navy)", lineHeight: 1.5 }}>
              <strong>Em resumo:</strong> metade dos contratos{q ? ` de ${q.split(",")[0].trim()}` : ""} ficou abaixo de {formatBRLCompact(mediana)}
              {mediana != null && mediana <= 80000 ? ", uma faixa com disputa exclusiva para ME/EPP" : ""}.{" "}
              {topo && `${nome(topo.nome)} foi quem mais comprou no período.`}
            </p>
            {nAbertos > 0 && (
              <Link className="btn btn-primary" href={buscaHref}>
                Ver {formatInt(nAbertos)} {nAbertos === 1 ? "edital aberto" : "editais abertos"}
              </Link>
            )}
          </div>

          <section aria-label="Totais" className="kpis">
            <Kpi label="Contratos publicados" value={formatInt(m.totais.contratos)} hint={`${formatInt(m.totais.orgaos)} órgãos compradores`} />
            <Kpi label="Valor contratado" value={formatBRLCompact(m.totais.valor)} hint="soma do valor global" />
            <Kpi label="Contrato mediano" value={formatBRL(mediana)} hint="metade dos contratos fica abaixo" />
            <Kpi label="Editais abertos agora" value={formatInt(nAbertos)} hint={<Link href={buscaHref}>ver na busca</Link>} />
          </section>

          <section className="card card-pad stack" style={{ gap: 14 }}>
            <div className="card-title">
              <h2>Valor contratado por semana</h2>
              <span className="xs subtle">{formatInt(m.totais.fornecedores)} fornecedores distintos</span>
            </div>
            <Bars points={m.serie} />
          </section>

          <div className="duo">
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <h2 style={{ marginBottom: 4 }}>Quem mais compra</h2>
              <HBars rows={m.orgaos.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/orgao/${id}`} />
            </section>
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <h2 style={{ marginBottom: 4 }}>Quem mais vence</h2>
              {m.fornecedores.length ? (
                <HBars escuro rows={m.fornecedores.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/fornecedor/${id}`} />
              ) : (
                <p className="small muted">Sem fornecedores pessoa jurídica no período.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/mercado">) {
  return (
    <Suspense fallback={<Loading label="Analisando contratos…" />}>
      <Mercado {...props} />
    </Suspense>
  );
}
