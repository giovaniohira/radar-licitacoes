import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { formatBRL, formatData, prazo } from "@/lib/format";
import { pncpUrl, type EditalRow } from "@/lib/pncp";
import { currentUser } from "@/lib/session";
import type { Resumo } from "@/lib/summary";
import { acompanhar } from "../../actions";
import { ResumoIA } from "./ResumoIA";

const ESFERA: Record<string, string> = { M: "Municipal", E: "Estadual", F: "Federal", D: "Distrital" };

async function EditalConteudo({ params }: PageProps<"/edital/[id]">) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const [e] = await query<EditalRow & { valor_estimado: string | null }>(`select * from editais where id = $1`, [id]);
  if (!e) notFound();
  const user = await currentUser();
  const [[resumo], [acomp]] = await Promise.all([
    query<{ dados: Resumo; documento: string }>(`select dados, documento from resumos where edital_id = $1`, [id]),
    user
      ? query<{ status: string }>(`select status from acompanhamentos where user_id = $1 and edital_id = $2`, [user.id, id])
      : Promise.resolve([]),
  ]);

  return (
    <main>
      <p className="small" style={{ marginTop: 24 }}>
        <Link href="/buscar">← Voltar para a busca</Link>
      </p>
      <h1 style={{ fontSize: 24 }}>{e.objeto}</h1>
      <p className="muted">
        {e.orgao}
        {e.unidade && e.unidade !== e.orgao ? ` · ${e.unidade}` : ""} · {[e.municipio, e.uf].filter(Boolean).join("/")}
      </p>

      <div className="grid3">
        <div className="card">
          <div className="muted small">Valor estimado</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatBRL(e.valor_estimado)}</div>
          {e.srp && <span className="pill">Registro de preços</span>}
        </div>
        <div className="card">
          <div className="muted small">Propostas até</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatData(e.encerramento)}</div>
          <span className="pill warn">{prazo(e.encerramento)}</span>
        </div>
        <div className="card">
          <div className="muted small">Modalidade</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{e.modalidade}</div>
          <div className="muted small">{e.situacao}</div>
        </div>
      </div>

      <dl className="kv card">
        <dt>Abertura das propostas</dt>
        <dd>{formatData(e.abertura)}</dd>
        <dt>Publicado no PNCP</dt>
        <dd>{formatData(e.publicado_em)}</dd>
        <dt>Esfera</dt>
        <dd>{(e.esfera && ESFERA[e.esfera]) ?? "—"}</dd>
        <dt>CNPJ do órgão</dt>
        <dd>{e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</dd>
        <dt>Nº de controle PNCP</dt>
        <dd>{e.id}</dd>
        {e.info_complementar && (
          <>
            <dt>Informação complementar</dt>
            <dd>{e.info_complementar}</dd>
          </>
        )}
        <dt>Links</dt>
        <dd>
          <a href={pncpUrl(e)} target="_blank" rel="noreferrer">
            Ver no PNCP
          </a>
          {e.link_origem && (
            <>
              {" · "}
              <a href={e.link_origem} target="_blank" rel="noreferrer">
                Sistema de origem (enviar proposta)
              </a>
            </>
          )}
        </dd>
      </dl>

      <h2>Acompanhar</h2>
      {user ? (
        <form action={acompanhar} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="edital" value={e.id} />
          {[
            ["interesse", "Em análise"],
            ["preparando", "Preparando proposta"],
            ["enviada", "Proposta enviada"],
            ["descartado", "Descartar"],
          ].map(([v, label]) => (
            <button key={v} name="status" value={v} className={acomp?.status === v ? "" : "ghost"}>
              {label}
            </button>
          ))}
          {acomp && (
            <button name="status" value="remover" className="link">
              remover do painel
            </button>
          )}
        </form>
      ) : (
        <p className="muted">
          <Link href="/entrar">Entre</Link> para acompanhar este edital e receber alertas parecidos.
        </p>
      )}

      <h2>Resumo do edital</h2>
      {user || resumo ? (
        <ResumoIA editalId={e.id} inicial={resumo ? { resumo: resumo.dados, documento: resumo.documento } : null} />
      ) : (
        <p className="muted">
          <Link href="/entrar">Entre</Link> para gerar o resumo por IA.
        </p>
      )}
    </main>
  );
}

export default function Edital(props: PageProps<"/edital/[id]">) {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <EditalConteudo {...props} />
    </Suspense>
  );
}
