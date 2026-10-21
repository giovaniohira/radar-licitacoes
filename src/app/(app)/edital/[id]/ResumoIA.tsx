"use client";

import { useActionState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { Resumo } from "@/lib/summary";
import { resumir, type ResumoState } from "../../../actions/resumo";

function Cabecalho({ children }: { children?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="row" style={{ gap: 10 }}>
        <span className="ia-mark">
          <Icon name="sparkles" />
        </span>
        <h2>Resumo do edital</h2>
      </div>
      {children}
    </div>
  );
}

function ResumoView({ r, documento }: { r: Resumo; documento?: string }) {
  return (
    <section className="card">
      <Cabecalho>
        <span className="xs subtle">Feito por IA a partir do PDF. Confira os pontos críticos no edital.</span>
      </Cabecalho>
      <div className="card-body stack-lg">
        <p className="ia-frase">{r.objeto}</p>
        <dl className="ia-fatos">
          <div>
            <dt>ME/EPP</dt>
            <dd>{r.exclusivo_me_epp ? "Exclusivo ou cota reservada" : "Ampla concorrência"}</dd>
          </div>
          <div>
            <dt>Julgamento</dt>
            <dd>{r.criterio_julgamento}</dd>
          </div>
          <div>
            <dt>Garantia</dt>
            <dd>{r.garantia}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{r.valor_estimado}</dd>
          </div>
        </dl>
        <div className="grid g2" style={{ gap: 28 }}>
          {r.pontos_de_atencao.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <h3 className="overline urgente">Pontos de atenção</h3>
              <ul className="ia-alertas">
                {r.pontos_de_atencao.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {r.prazos.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <h3 className="overline">Datas</h3>
              <ol className="ia-datas">
                {r.prazos.map((p, i) => (
                  <li key={i}>
                    <span className="num">{p.data}</span>
                    {p.evento}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h3 className="overline">Documentos de habilitação</h3>
          <ul className="list small">
            {r.exigencias_habilitacao.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p className="xs subtle">Ao acompanhar no pipeline, esta lista vira o checklist do card.</p>
        </div>
        <p className="xs subtle">
          Entrega e execução: {r.local_entrega_execucao}.{" "}
          {documento && (
            <a className="link" href={documento} target="_blank" rel="noreferrer">
              Abrir o documento lido
            </a>
          )}
        </p>
      </div>
    </section>
  );
}

export function ResumoIA({ editalId, inicial }: { editalId: string; inicial: ResumoState }) {
  const [state, action, pending] = useActionState(resumir, inicial);
  if (state?.resumo) return <ResumoView r={state.resumo} documento={state.documento} />;
  return (
    <form action={action} className="card">
      <Cabecalho />
      <div className="card-body stack">
        <input type="hidden" name="edital" value={editalId} />
        <p className="muted">
          A IA lê o PDF do edital e devolve prazos, documentos de habilitação, cota ME/EPP, garantia e as armadilhas para uma empresa pequena.
        </p>
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Icon name="sparkles" size={14} /> {pending ? "Lendo o edital… (até 1 min)" : "Resumir edital com IA"}
          </button>
        </div>
        {state?.error && <div className="notice danger">{state.error}</div>}
      </div>
    </form>
  );
}
