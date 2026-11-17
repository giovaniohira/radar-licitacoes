"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { formatBRL, formatData } from "@/lib/format";
import type { CardDetalhe } from "@/lib/pipeline";
import { addChecklist, addNota, definirValorProposta, importarChecklistIA, removerChecklist, toggleChecklist } from "../../../actions/pipeline";

/** Habilitação checklist of a tracked edital: what is missing first, the done items folded away. */
export function Checklist({ editalId, inicial, temResumo }: { editalId: string; inicial: CardDetalhe["checklist"]; temResumo: boolean }) {
  const [itens, setItens] = useState(inicial);
  const [pending, start] = useTransition();
  const feitos = itens.filter((c) => c.feito);
  const faltam = itens.filter((c) => !c.feito);
  const toggle = (id: number, feito: boolean) => {
    setItens((xs) => xs.map((x) => (x.id === id ? { ...x, feito } : x)));
    start(() => toggleChecklist(editalId, id, feito));
  };

  return (
    <section id="checklist" className="card card-pad stack">
      <div className="card-title">
        <h2>Documentos</h2>
        {itens.length > 0 && (
          <span className="xs muted num">
            {feitos.length} de {itens.length} prontos
          </span>
        )}
      </div>
      {itens.length === 0 ? (
        <p className="small muted">
          Liste aqui os documentos de habilitação.{temResumo ? " Ou traga a lista que a IA leu do edital." : ""}
        </p>
      ) : (
        <>
          <div className="progress">
            <i style={{ width: `${(feitos.length / itens.length) * 100}%` }} />
          </div>
          {faltam.length > 0 && <div className="falta">Faltam {faltam.length}</div>}
          <div className="stack" style={{ gap: 6, marginTop: -4 }}>
            {faltam.map((c) => (
              <label key={c.id} className="todo">
                <input type="checkbox" checked={false} onChange={() => toggle(c.id, true)} />
                <span>{c.texto}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label={`Remover ${c.texto}`}
                  onClick={() => start(async () => setItens((await removerChecklist(editalId, c.id)).checklist))}
                >
                  <Icon name="x" size={13} />
                </button>
              </label>
            ))}
          </div>
          {feitos.length > 0 && (
            <details className="prontos" open={faltam.length === 0}>
              <summary>{feitos.length === 1 ? "1 já pronto" : `${feitos.length} já prontos`}</summary>
              <ul>
                {feitos.map((c) => (
                  <li key={c.id}>
                    <input type="checkbox" checked onChange={() => toggle(c.id, false)} aria-label={c.texto} />
                    <span>{c.texto}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {itens.length === 0 && temResumo && (
        <button className="btn" disabled={pending} onClick={() => start(async () => setItens((await importarChecklistIA(editalId)).checklist))}>
          <Icon name="sparkle" size={14} /> Trazer a lista do resumo IA
        </button>
      )}
      <form className="add-row" action={(fd) => start(async () => setItens((await addChecklist(editalId, String(fd.get("texto") ?? ""))).checklist))}>
        <input className="input" name="texto" placeholder="+ Adicionar item" aria-label="Novo item do checklist" />
        <button className="btn btn-icon" disabled={pending} aria-label="Adicionar">
          <Icon name="plus" size={15} />
        </button>
      </form>
    </section>
  );
}

export function Notas({
  editalId,
  inicial,
  valorProposta,
  valorEstimado,
}: {
  editalId: string;
  inicial: CardDetalhe["notas"];
  valorProposta: number | null;
  valorEstimado: number | string | null;
}) {
  const [notas, setNotas] = useState(inicial);
  const [pending, start] = useTransition();
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <h2>Notas</h2>
      <form
        className="stack"
        style={{ gap: 6 }}
        action={(fd) =>
          start(async () => {
            setNotas((await addNota(editalId, String(fd.get("texto") ?? ""))).notas);
          })
        }
      >
        <label htmlFor="nota" className="sr-only">
          Nova nota
        </label>
        <textarea id="nota" className="input" name="texto" placeholder="Ligação com o pregoeiro, cotação do fornecedor, dúvidas…" />
        <button className="btn btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>
          Salvar nota
        </button>
      </form>
      {notas.map((n) => (
        <div key={n.id} className="note">
          <small>{formatData(n.criado_em)}</small>
          {n.texto}
        </div>
      ))}
      <label className="field" style={{ marginTop: 4 }}>
        Valor da sua proposta (R$)
        <input
          className="input num"
          inputMode="decimal"
          defaultValue={valorProposta ?? ""}
          placeholder={Number(valorEstimado) ? `estimado ${formatBRL(valorEstimado)}` : "R$"}
          onBlur={(e) => {
            const v = e.target.value;
            start(() => definirValorProposta(editalId, v));
          }}
        />
      </label>
    </section>
  );
}
