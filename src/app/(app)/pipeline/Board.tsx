"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type DragEvent } from "react";
import { Icon } from "@/components/icons";
import { PrazoBadge, editalHref } from "@/components/ui";
import { formatBRL, formatBRLCompact, formatData, frase, local, nome } from "@/lib/format";
import { parseValor } from "@/lib/params";
import type { CardDetalhe, PipelineItem } from "@/lib/pipeline";
import {
  addChecklist,
  addNota,
  definirValorProposta,
  detalheCard,
  importarChecklistIA,
  moverCard,
  removerChecklist,
  toggleChecklist,
} from "../../actions/pipeline";

type EtapaInfo = { id: string; label: string; cor: string };

function Drawer({
  item,
  etapas,
  onClose,
  onMove,
  onChange,
}: {
  item: PipelineItem;
  etapas: EtapaInfo[];
  onClose: () => void;
  onMove: (etapa: string) => void;
  onChange: (patch: Partial<PipelineItem>) => void;
}) {
  const [det, setDet] = useState<CardDetalhe | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);

  const open = (el: HTMLDialogElement | null) => {
    ref.current = el;
    if (el && !el.open) {
      el.showModal();
      start(async () => setDet(await detalheCard(item.edital_id)));
    }
  };
  const update = (d: CardDetalhe) => {
    setDet(d);
    onChange({ check_total: d.checklist.length, check_feito: d.checklist.filter((c) => c.feito).length });
  };

  return (
    <dialog className="drawer" ref={open} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="drawer-head">
        <div style={{ minWidth: 0 }}>
          <Link className="title" href={editalHref(item.edital_id)} style={{ fontWeight: 600 }}>
            {frase(item.objeto)}
          </Link>
          <div className="small muted" style={{ marginTop: 4 }}>
            {nome(item.orgao)} · {local(item.municipio, item.uf)}
          </div>
        </div>
        <button className="btn btn-ghost" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <Icon name="x" />
        </button>
      </div>
      <div className="drawer-body">
        <div className="grid g2">
          <label className="field">
            <span>Etapa</span>
            <select className="input" value={item.etapa} onChange={(e) => onMove(e.target.value)}>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor da proposta (R$)</span>
            <input
              className="input num"
              inputMode="decimal"
              defaultValue={item.valor_proposta ?? ""}
              placeholder={item.valor_estimado ? `estimado ${formatBRL(item.valor_estimado)}` : "R$"}
              onBlur={(e) => {
                const v = e.target.value;
                onChange({ valor_proposta: parseValor(v) });
                start(() => definirValorProposta(item.edital_id, v));
              }}
            />
          </label>
        </div>
        <dl className="kv">
          <dt>Propostas até</dt>
          <dd>
            {formatData(item.encerramento)} <PrazoBadge d={item.encerramento} />
          </dd>
          <dt>Valor estimado</dt>
          <dd>{formatBRL(item.valor_estimado)}</dd>
          <dt>Modalidade</dt>
          <dd>{item.modalidade ?? "—"}</dd>
        </dl>

        <section className="stack" style={{ gap: 6 }}>
          <div className="spread">
            <h3>Checklist de habilitação</h3>
            {det && det.checklist.length === 0 && (
              <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => update(await importarChecklistIA(item.edital_id)))}>
                <Icon name="sparkles" size={12} /> Importar do resumo IA
              </button>
            )}
          </div>
          {!det ? (
            <p className="small muted">Carregando…</p>
          ) : (
            <>
              {det.checklist.length > 0 && (
                <div className="progress" aria-hidden>
                  <i style={{ width: `${(det.checklist.filter((c) => c.feito).length / det.checklist.length) * 100}%` }} />
                </div>
              )}
              {det.checklist.map((c) => (
                <div key={c.id} className={`todo${c.feito ? " done" : ""}`}>
                  <input
                    type="checkbox"
                    checked={c.feito}
                    aria-label={c.texto}
                    onChange={(e) => {
                      const feito = e.target.checked;
                      update({ ...det, checklist: det.checklist.map((x) => (x.id === c.id ? { ...x, feito } : x)) });
                      start(() => toggleChecklist(item.edital_id, c.id, feito));
                    }}
                  />
                  <span style={{ flex: 1 }}>{c.texto}</span>
                  <button className="btn btn-ghost btn-sm" aria-label="Remover item" onClick={() => start(async () => update(await removerChecklist(item.edital_id, c.id)))}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <form
                className="row"
                style={{ flexWrap: "nowrap" }}
                action={(fd) => start(async () => update(await addChecklist(item.edital_id, String(fd.get("texto") ?? ""))))}
              >
                <input className="input" name="texto" placeholder="Adicionar item…" aria-label="Novo item do checklist" />
                <button className="btn" disabled={pending}>
                  <Icon name="plus" size={14} />
                </button>
              </form>
            </>
          )}
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h3>Notas</h3>
          <form className="stack" style={{ gap: 6 }} action={(fd) => start(async () => setDet(await addNota(item.edital_id, String(fd.get("texto") ?? ""))))}>
            <textarea className="input" name="texto" placeholder="Ligação com o pregoeiro, cotação do fornecedor, dúvidas…" aria-label="Nova nota" />
            <div>
              <button className="btn btn-sm" disabled={pending}>
                Salvar nota
              </button>
            </div>
          </form>
          {det?.notas.map((n) => (
            <div key={n.id} className="note">
              <div className="when">{formatData(n.criado_em)}</div>
              {n.texto}
            </div>
          ))}
        </section>
      </div>
    </dialog>
  );
}

export function Board({ etapas, inicial }: { etapas: EtapaInfo[]; inicial: PipelineItem[] }) {
  const [itens, setItens] = useState(inicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null); // column under the pointer, for the highlight
  const [aberto, setAberto] = useState<string | null>(null);
  const [, start] = useTransition();

  const coluna = (etapa: string) => itens.filter((i) => i.etapa === etapa).sort((a, b) => a.posicao - b.posicao);

  function mover(id: string, etapa: string, index?: number) {
    const resto = coluna(etapa).filter((i) => i.edital_id !== id);
    const at = index == null ? resto.length : Math.min(index, resto.length);
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
  function indexAt(e: DragEvent<HTMLDivElement>, ignorar: string | null) {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== ignorar);
    const index = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return index < 0 ? cards.length : index;
  }

  function onDragOver(e: DragEvent<HTMLDivElement>, etapa: string) {
    e.preventDefault();
    setSobre(etapa);
  }

  const item = itens.find((i) => i.edital_id === aberto);

  return (
    <>
      <div className="board">
        {etapas.map((et) => {
          const cards = coluna(et.id);
          const soma = cards.reduce((s, i) => s + (i.valor_proposta ?? i.valor_estimado ?? 0), 0);
          return (
            <div
              key={et.id}
              className={`col${sobre === et.id ? " over" : ""}`}
              onDragOver={(e) => onDragOver(e, et.id)}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSobre(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) mover(id, et.id, indexAt(e, id));
                setSobre(null);
                setArrastando(null);
              }}
            >
              <div className="col-head">
                <span>
                  <span className="dot" style={{ background: et.cor }} />
                  {et.label} <span className="count">{cards.length}</span>
                </span>
                {soma > 0 && <span className="count num">{formatBRLCompact(soma)}</span>}
              </div>
              {cards.map((i) => (
                <button
                  key={i.edital_id}
                  data-card={i.edital_id}
                  className={`kcard${arrastando === i.edital_id ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", i.edital_id);
                    e.dataTransfer.effectAllowed = "move";
                    setArrastando(i.edital_id);
                  }}
                  onDragEnd={() => {
                    setArrastando(null);
                    setSobre(null);
                  }}
                  onClick={() => setAberto(i.edital_id)}
                >
                  <span className="t clamp2">{frase(i.objeto)}</span>
                  <span className="m clamp2">{nome(i.orgao)}</span>
                  <span className="f">
                    <span className="num" style={{ fontWeight: 600 }}>
                      {formatBRLCompact(i.valor_proposta ?? i.valor_estimado)}
                    </span>
                    {["triagem", "analise", "preparando"].includes(i.etapa) && <PrazoBadge d={i.encerramento} />}
                  </span>
                  {i.check_total > 0 && (
                    <span className="f m">
                      <span className="progress" style={{ flex: 1 }}>
                        <i style={{ width: `${(i.check_feito / i.check_total) * 100}%` }} />
                      </span>
                      <span className="num">
                        {i.check_feito}/{i.check_total}
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {item && (
        <Drawer
          key={item.edital_id}
          item={item}
          etapas={etapas}
          onClose={() => setAberto(null)}
          onMove={(etapa) => mover(item.edital_id, etapa)}
          onChange={(patch) => setItens((prev) => prev.map((i) => (i.edital_id === item.edital_id ? { ...i, ...patch } : i)))}
        />
      )}
    </>
  );
}
