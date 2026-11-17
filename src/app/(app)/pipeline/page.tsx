import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { Empty, Loading, PageHead, PrazoPill, editalHref, valorCurto } from "@/components/ui";
import { pool } from "@/lib/db";
import { formatBRLCompact, formatData, formatInt, frase, nome, tituloCurto } from "@/lib/format";
import { first } from "@/lib/params";
import { etapaLabel, listPipeline } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { Board } from "./Board";

export const metadata: Metadata = { title: "Minhas disputas", robots: { index: false } };

const EM_DISPUTA = ["triagem", "analise", "preparando", "enviada"];

async function Pipeline({ searchParams }: PageProps<"/pipeline">) {
  await connection();
  const user = await requireUser();
  const lista = first((await searchParams).view) === "lista";
  const itens = await listPipeline(pool(), user.id);
  const ativos = itens.filter((i) => EM_DISPUTA.includes(i.etapa));
  const valor = ativos.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0);

  return (
    <div className="page wide" style={{ gap: 20 }}>
      <PageHead
        title="Minhas disputas"
        sub={
          itens.length
            ? `${valor ? formatBRLCompact(valor) : "R$ 0"} em ${formatInt(ativos.length)} ${ativos.length === 1 ? "edital" : "editais"}. Arraste o cartão quando mudar de etapa.`
            : "Os editais em que você tem interesse ficam aqui, da triagem ao resultado."
        }
        actions={
          <>
            <div className="seg" role="tablist" aria-label="Visualização">
              <Link href="/pipeline" aria-current={lista ? undefined : "true"}>
                Quadro
              </Link>
              <Link href="/pipeline?view=lista" aria-current={lista ? "true" : undefined}>
                Lista
              </Link>
            </div>
            <Link className="btn" href="/conta#agenda">
              <Icon name="calendar" size={15} /> Sincronizar agenda
            </Link>
          </>
        }
      />
      {itens.length === 0 ? (
        <div className="card">
          <Empty title="Nenhuma disputa ainda">
            Em <Link href="/buscar">Encontrar editais</Link>, clique em “Tenho interesse” num edital e ele aparece aqui.
          </Empty>
        </div>
      ) : lista ? (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Edital</th>
                <th>Etapa</th>
                <th className="r">Valor</th>
                <th>Documentos</th>
                <th>Propostas até</th>
              </tr>
            </thead>
            <tbody>
              {[...itens]
                .sort((a, b) => (a.encerramento ? new Date(a.encerramento).getTime() : Infinity) - (b.encerramento ? new Date(b.encerramento).getTime() : Infinity))
                .map((i) => (
                  <tr key={i.edital_id}>
                    <td style={{ maxWidth: 520 }}>
                      <Link className="t" href={editalHref(i.edital_id)} style={{ color: "var(--text)" }}>
                        {tituloCurto(frase(i.objeto))}
                      </Link>
                      <div className="m">
                        {nome(i.orgao)}
                        {i.uf && ` · ${i.uf}`}
                      </div>
                    </td>
                    <td>
                      <span className="pill">{etapaLabel(i.etapa)}</span>
                    </td>
                    <td className="r num nowrap">{valorCurto(i.valor_proposta ?? i.valor_estimado)}</td>
                    <td className="num">{i.check_total ? `${i.check_feito} de ${i.check_total}` : "—"}</td>
                    <td className="nowrap">
                      <div className="num">{formatData(i.encerramento)}</div>
                      {i.encerramento && <PrazoPill d={i.encerramento} />}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Board inicial={itens} />
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
