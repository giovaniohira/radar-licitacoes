import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { EditalItem, Empty, Loading, PageHead, Stat } from "@/components/ui";
import { pool, query } from "@/lib/db";
import { formatBRLCompact, formatInt, horasAtras } from "@/lib/format";
import { ETAPAS_ATIVAS, etapaLabel, listPipeline, vencendo } from "@/lib/pipeline";
import { buildSearch, type EditalResumo } from "@/lib/search";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Visão geral" };

interface AlertRow {
  id: number;
  nome: string;
  palavras: string;
  ufs: string[];
  modalidades: number[];
  valor_min: string | null;
  valor_max: string | null;
}

async function Overview() {
  await connection();
  const user = await requireUser();
  const [itens, alerts] = await Promise.all([
    listPipeline(pool(), user.id),
    query<AlertRow>(`select id, nome, palavras, ufs, modalidades, valor_min, valor_max from alerts where user_id = $1 and ativo order by id`, [user.id]),
  ]);

  // New matches per alert in the last 24h, same query the daily digest uses.
  const desde = horasAtras(24);
  const novos = await Promise.all(
    alerts.map(async (a) => {
      const { sql, params } = buildSearch(
        {
          palavras: a.palavras,
          ufs: a.ufs,
          modalidades: a.modalidades,
          valorMin: a.valor_min == null ? null : Number(a.valor_min),
          valorMax: a.valor_max == null ? null : Number(a.valor_max),
          desde,
          ordem: "recentes",
        },
        { limit: 3 },
      );
      const rows = await query<EditalResumo>(sql, params);
      return { alert: a, rows, total: Number(rows[0]?.total ?? 0) };
    }),
  );

  const ativos = itens.filter((i) => ETAPAS_ATIVAS.includes(i.etapa) || i.etapa === "enviada");
  const semana = vencendo(itens);
  const emJogo = ativos.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0);
  const ganhas = itens.filter((i) => i.etapa === "ganha");
  const decididas = itens.filter((i) => i.etapa === "ganha" || i.etapa === "perdida").length;
  const totalNovos = novos.reduce((s, n) => s + n.total, 0);

  return (
    <div className="page">
      <PageHead
        title="Visão geral"
        sub={user.demo ? "Conta demo: os dados voltam ao estado inicial todo dia às 4h." : user.email}
        actions={
          <>
            <Link className="btn" href="/alertas">
              <Icon name="bell" size={14} /> Alertas
            </Link>
            <Link className="btn btn-primary" href="/buscar">
              <Icon name="search" size={14} /> Buscar editais
            </Link>
          </>
        }
      />
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Stat label="No pipeline" value={formatInt(ativos.length)} hint={`${formatInt(itens.length)} no total`} />
        <Stat label="Valor em disputa" value={formatBRLCompact(emJogo)} hint="proposta ou estimado" />
        <Stat label="Vencem em 7 dias" value={formatInt(semana.length)} hint="triagem a preparação" />
        <Stat
          label="Taxa de vitória"
          value={decididas ? `${Math.round((ganhas.length / decididas) * 100)}%` : "—"}
          hint={`${ganhas.length} de ${decididas} decididas`}
        />
      </div>

      <div className="grid cols-main">
        <section className="card">
          <div className="card-head">
            <h2>Novos para seus alertas (24h)</h2>
            <span className="badge b-accent plain num">{formatInt(totalNovos)}</span>
          </div>
          {alerts.length === 0 ? (
            <Empty title="Nenhum alerta ativo">
              <Link className="link" href="/alertas">
                Crie um alerta
              </Link>{" "}
              e os editais novos aparecem aqui e no seu e-mail.
            </Empty>
          ) : totalNovos === 0 ? (
            <Empty title="Nada novo nas últimas 24h">Seus alertas são verificados três vezes por dia.</Empty>
          ) : (
            novos
              .filter((n) => n.total > 0)
              .map((n) => (
                <div key={n.alert.id}>
                  <div className="spread" style={{ padding: "10px 16px 0" }}>
                    <span className="xs subtle" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {n.alert.nome}
                    </span>
                    {n.total > n.rows.length && (
                      <Link className="xs link" href={`/buscar?q=${encodeURIComponent(n.alert.palavras)}&ordem=recentes`}>
                        +{formatInt(n.total - n.rows.length)}
                      </Link>
                    )}
                  </div>
                  {n.rows.map((e) => (
                    <EditalItem key={e.id} e={e} />
                  ))}
                </div>
              ))
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Prazos desta semana</h2>
            <Link className="btn btn-sm" href="/pipeline">
              Pipeline
            </Link>
          </div>
          {semana.length === 0 ? (
            <Empty title="Nenhum prazo nos próximos 7 dias" />
          ) : (
            semana.map((i) => (
              <EditalItem key={i.edital_id} e={{ ...i, id: i.edital_id }} extra={<span className="badge plain">{etapaLabel(i.etapa)}</span>} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

export default function Painel() {
  return (
    <Suspense fallback={<Loading />}>
      <Overview />
    </Suspense>
  );
}
