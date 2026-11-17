"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";
import { Icon } from "@/components/icons";
import { PrazoPill, editalHref, valorCurto } from "@/components/ui";
import { formatBRLCompact, frase, nome, tituloCurto } from "@/lib/format";
import type { PipelineItem } from "@/lib/pipeline";
import { moverCard } from "../../actions/pipeline";

type Coluna = { id: string; label: string; cor: string; dica: string; etapas: string[] };

// Ganha and perdida share the last column; the result is set on the edital page, so that column takes no drops.
const COLUNAS: Coluna[] = [
  { id: "triagem", label: "Triagem", cor: "e-triagem", dica: "Leia o resumo e decida se vale disputar.", etapas: ["triagem"] },
  { id: "analise", label: "Em análise", cor: "e-analise", dica: "Confira a habilitação e peça cotações.", etapas: ["analise"] },
  { id: "preparando", label: "Preparando proposta", cor: "e-preparando", dica: "Junte os documentos e monte a proposta.", etapas: ["preparando"] },
  { id: "enviada", label: "Proposta enviada", cor: "e-enviada", dica: "Acompanhe a sessão e o resultado.", etapas: ["enviada"] },
  { id: "resultado", label: "Resultado", cor: "e-ganha", dica: "Ganhos e perdidos. Marque o resultado na página do edital.", etapas: ["ganha", "perdida"] },
];

const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });

function passo(i: PipelineItem): string {
  const falta = i.check_total - i.check_feito;
  switch (i.etapa) {
    case "triagem":
      return "Ler o resumo e decidir";
    case "analise":
      return i.encerramento ? `Decidir até ${diaSemana.format(new Date(i.encerramento)).replace("-feira", "")}` : "Conferir a habilitação";
    case "preparando":
      return falta > 0 ? `Faltam ${falta} de ${i.check_total} documentos` : i.check_total ? "Documentos prontos: enviar a proposta" : "Montar o checklist de documentos";
    case "enviada":
      return "Registrar o resultado da sessão";
    case "ganha":
      return "Acompanhar assinatura e empenho";
    default:
      return "Ver quem venceu e por quanto";
  }
}

function Pill({ i }: { i: PipelineItem }) {
  if (i.etapa === "ganha") return <span className="pill ok">ganha</span>;
  if (i.etapa === "perdida") return <span className="pill">perdida</span>;
  if (i.etapa === "enviada") return <span className="pill">enviada</span>;
  return i.encerramento ? <PrazoPill d={i.encerramento} /> : <span className="pill">sem prazo</span>;
}

export function Board({ inicial }: { inicial: PipelineItem[] }) {
  const [itens, setItens] = useState(inicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null); // column under the pointer, for the highlight
  const [, start] = useTransition();

  const doStage = (etapas: string[]) => itens.filter((i) => etapas.includes(i.etapa)).sort((a, b) => a.posicao - b.posicao);

  function mover(id: string, etapa: string, index: number) {
    const resto = doStage([etapa]).filter((i) => i.edital_id !== id);
    const at = Math.min(index, resto.length);
    const ordem = [...resto.slice(0, at).map((i) => i.edital_id), id, ...resto.slice(at).map((i) => i.edital_id)];
    setItens((prev) =>
      prev.map((i) => {
        const pos = ordem.indexOf(i.edital_id);
        if (i.edital_id === id) return { ...i, etapa: etapa as PipelineItem["etapa"], posicao: pos };
        return pos >= 0 ? { ...i, posicao: pos } : i;
      }),
    );
    start(() => moverCard(id, etapa, ordem));
  }

  /** Insertion index under the pointer, ignoring the card being dragged. */
  function indexAt(e: DragEvent<HTMLElement>, ignorar: string | null) {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== ignorar);
    const index = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return index < 0 ? cards.length : index;
  }

  return (
    <div className="board-scroll">
      <div className="board">
        {COLUNAS.map((col) => {
          const cards = doStage(col.etapas);
          const soma = cards.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0);
          const ganhas = cards.filter((i) => i.etapa === "ganha").length;
          const aceita = col.id !== "resultado";
          return (
            <section
              key={col.id}
              aria-label={col.label}
              className={`col${sobre === col.id ? " over" : ""}`}
              onDragOver={(e) => {
                if (!aceita) return;
                e.preventDefault();
                setSobre(col.id);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSobre(null)}
              onDrop={(e) => {
                if (!aceita) return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/x-edital");
                if (id) mover(id, col.id, indexAt(e, id));
                setSobre(null);
                setArrastando(null);
              }}
            >
              <div className="col-head">
                <div className="row">
                  <i className={col.cor} />
                  <h2>{col.label}</h2>
                  <span className="n num">{cards.length}</span>
                  <span className="v num">{col.id === "resultado" ? `${ganhas} ${ganhas === 1 ? "ganho" : "ganhos"}` : formatBRLCompact(soma)}</span>
                </div>
                <p>{col.dica}</p>
              </div>
              {cards.map((i) => (
                <Link
                  key={i.edital_id}
                  href={editalHref(i.edital_id)}
                  data-card={i.edital_id}
                  className={`kcard${arrastando === i.edital_id ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-edital", i.edital_id);
                    e.dataTransfer.effectAllowed = "move";
                    setArrastando(i.edital_id);
                  }}
                  onDragEnd={() => {
                    setArrastando(null);
                    setSobre(null);
                  }}
                >
                  <span className="t clamp2">{tituloCurto(frase(i.objeto), 90)}</span>
                  <span className="m">
                    {nome(i.orgao)}
                    {i.uf && ` · ${i.uf}`}
                  </span>
                  <span className="f">
                    <b>{valorCurto(i.valor_proposta ?? i.valor_estimado)}</b>
                    <Pill i={i} />
                  </span>
                  <span className="passo">
                    <Icon name="arrowRight" size={14} strokeWidth={2.2} />
                    {passo(i)}
                  </span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
