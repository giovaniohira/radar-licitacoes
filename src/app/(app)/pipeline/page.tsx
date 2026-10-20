import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { Empty, Loading, PageHead, PrazoBadge, editalHref } from "@/components/ui";
import { icsToken } from "@/lib/auth";
import { pool } from "@/lib/db";
import { formatBRL, formatData, frase, local, nome } from "@/lib/format";
import { first } from "@/lib/params";
import { ETAPAS, etapaLabel, listPipeline } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { Board } from "./Board";

export const metadata: Metadata = { title: "Pipeline" };

async function Pipeline({ searchParams }: PageProps<"/pipeline">) {
  await connection();
  const user = await requireUser();
  const lista = first((await searchParams).view) === "lista";
  const itens = await listPipeline(pool(), user.id);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const ics = `${appUrl}/pipeline.ics?u=${user.id}&t=${icsToken(user.id)}`;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <PageHead
        title="Pipeline de propostas"
        sub="Arraste os cards entre as etapas. Clique em um card para checklist, notas e valor da proposta."
        actions={
          <>
            <div className="seg">
              <Link href="/pipeline" aria-current={!lista}>
                Quadro
              </Link>
              <Link href="/pipeline?view=lista" aria-current={lista}>
                Lista por prazo
              </Link>
            </div>
            <details style={{ position: "relative" }}>
              <summary className="btn" style={{ listStyle: "none" }}>
                <Icon name="calendar" size={14} /> Agenda
              </summary>
              <div className="card card-body stack" style={{ position: "absolute", right: 0, top: 38, width: 340, zIndex: 5 }}>
                <p className="small">Assine este endereço no Google Agenda (Outras agendas → Do URL) para ver os prazos com lembrete 1 dia antes.</p>
                <input className="input mono" readOnly value={ics} aria-label="Endereço da agenda" />
              </div>
            </details>
          </>
        }
      />
      {itens.length === 0 ? (
        <div className="card">
          <Empty title="Seu pipeline está vazio">
            Abra um edital na{" "}
            <Link className="link" href="/buscar">
              busca
            </Link>{" "}
            e clique em “Adicionar ao pipeline”.
          </Empty>
        </div>
      ) : lista ? (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Edital</th>
                <th>Etapa</th>
                <th className="r">Valor</th>
                <th>Checklist</th>
                <th>Propostas até</th>
              </tr>
            </thead>
            <tbody>
              {[...itens]
                .sort((a, b) => (a.encerramento ? new Date(a.encerramento).getTime() : Infinity) - (b.encerramento ? new Date(b.encerramento).getTime() : Infinity))
                .map((i) => (
                  <tr key={i.edital_id}>
                    <td style={{ maxWidth: 520 }}>
                      <Link className="title clamp2" href={editalHref(i.edital_id)}>
                        {frase(i.objeto)}
                      </Link>
                      <div className="sub">
                        {nome(i.orgao)} · {local(i.municipio, i.uf)}
                      </div>
                    </td>
                    <td>
                      <span className="badge plain">{etapaLabel(i.etapa)}</span>
                    </td>
                    <td className="r num nowrap">{formatBRL(i.valor_proposta ?? i.valor_estimado)}</td>
                    <td className="num">{i.check_total ? `${i.check_feito}/${i.check_total}` : "—"}</td>
                    <td className="nowrap">
                      <div className="num">{formatData(i.encerramento)}</div>
                      <PrazoBadge d={i.encerramento} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Board etapas={ETAPAS.map((e) => ({ ...e }))} inicial={itens} />
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/pipeline">) {
  return (
    <Suspense fallback={<Loading />}>
      <Pipeline {...props} />
    </Suspense>
  );
}
