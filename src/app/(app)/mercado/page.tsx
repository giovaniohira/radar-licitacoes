import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Bars, HBars } from "@/components/charts";
import { Icon } from "@/components/icons";
import { ContratosTabela } from "@/components/ContratosTabela";
import { Empty, Loading, PageHead, Stat } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRL, formatBRLCompact, formatInt, nome } from "@/lib/format";
import { PERIODOS, analisar, contratosRecentes } from "@/lib/mercado";
import { first, withParams } from "@/lib/params";
import { buildSearch } from "@/lib/search";
import { SETORES, UFS } from "@/lib/setores";

export const metadata: Metadata = { title: "Mercado" };

async function Mercado({ searchParams }: PageProps<"/mercado">) {
  await connection();
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 300);
  const uf = first(sp.uf);
  const dias = PERIODOS.find((p) => String(p) === first(sp.dias)) ?? 90;
  const f = { q, uf, dias };
  const abertos = buildSearch({ palavras: q, ufs: uf ? [uf] : [] }, { limit: 1 });
  const [m, recentes, [aberto]] = await Promise.all([
    analisar(pool(), f),
    contratosRecentes(pool(), f, 15),
    query<{ total: string }>(abertos.sql, abertos.params),
  ]);
  const nAbertos = Number(aberto?.total ?? 0);

  return (
    <div className="page">
      <PageHead
        title="Inteligência de mercado"
        sub="Contratos publicados no PNCP: quem compra, quem vence e por quanto."
        actions={
          <div className="seg">
            {PERIODOS.map((p) => (
              <Link key={p} href={`/mercado${withParams(sp, { dias: String(p) })}`} aria-current={p === dias}>
                {p === 365 ? "12 meses" : `${p} dias`}
              </Link>
            ))}
          </div>
        }
      />
      <Form action="/mercado" className="card card-body stack" style={{ marginBottom: 20 }}>
        <input type="hidden" name="dias" value={dias} />
        <div className="searchbar">
          <input className="input input-lg" name="q" defaultValue={q} placeholder="Qual mercado? ex.: notebook, merenda escolar, pavimentação" aria-label="Mercado" />
          <select className="input input-lg" name="uf" defaultValue={uf} aria-label="Estado" style={{ flex: "0 0 112px" }}>
            <option value="">Brasil</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-lg">
            <Icon name="chart" /> Analisar
          </button>
        </div>
        <div className="row">
          <span className="xs subtle">Setores:</span>
          {SETORES.map((s) => (
            <Link key={s.id} className="btn btn-sm" href={`/mercado?q=${encodeURIComponent(s.palavras)}&dias=${dias}${uf ? `&uf=${uf}` : ""}`}>
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
        <div className="stack-lg">
          <div className="grid g4">
            <Stat label="Contratos publicados" value={formatInt(m.totais.contratos)} hint={`${formatInt(m.totais.orgaos)} órgãos compradores`} />
            <Stat label="Valor contratado" value={formatBRLCompact(m.totais.valor)} hint="soma do valor global" />
            <Stat label="Contrato mediano" value={formatBRL(m.totais.mediana)} hint="metade dos contratos fica abaixo" />
            <Stat
              label="Editais abertos agora"
              value={formatInt(nAbertos)}
              hint={
                <Link className="link" href={`/buscar?q=${encodeURIComponent(q)}${uf ? `&uf=${uf}` : ""}`}>
                  ver na busca
                </Link>
              }
            />
          </div>

          <section className="card">
            <div className="card-head">
              <h2>Valor contratado por semana</h2>
              <span className="xs subtle">{formatInt(m.totais.fornecedores)} fornecedores distintos</span>
            </div>
            <div className="card-body">
              <Bars points={m.serie} />
            </div>
          </section>

          <div className="grid g2">
            <section className="card">
              <div className="card-head">
                <h2>Quem mais compra</h2>
              </div>
              <div className="card-body">
                <HBars rows={m.orgaos.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/orgao/${id}`} />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Quem mais vence</h2>
              </div>
              <div className="card-body">
                {m.fornecedores.length ? (
                  <HBars rows={m.fornecedores.map((o) => ({ ...o, nome: nome(o.nome) }))} href={(id) => `/fornecedor/${id}`} />
                ) : (
                  <p className="small muted">Sem fornecedores pessoa jurídica no período.</p>
                )}
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Tamanho dos contratos</h2>
              </div>
              <div className="card-body">
                <HBars rows={m.faixas.map((x) => ({ id: x.faixa, nome: x.faixa, n: x.n, valor: 0 }))} metric="n" />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Por estado</h2>
              </div>
              <div className="card-body">
                <HBars rows={m.ufs.slice(0, 10)} href={(id) => `/mercado${withParams(sp, { uf: id })}`} />
              </div>
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <h2>Contratos mais recentes</h2>
            </div>
            <ContratosTabela rows={recentes} />
          </section>
        </div>
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
