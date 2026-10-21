"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import type { Resumo } from "@/lib/summary";
import { resumir, type ResumoState } from "../../../actions/resumo";

function ResumoView({ r, documento }: { r: Resumo; documento?: string }) {
  return (
    <div className="card">
      <div className="card-body stack-lg">
        <p style={{ fontSize: 15 }}>{r.objeto}</p>
        <div className="row">
          {r.exclusivo_me_epp ? <span className="badge b-ok">Exclusivo ou cota ME/EPP</span> : <span className="badge">Ampla concorrência</span>}
          <span className="badge b-info">{r.criterio_julgamento}</span>
        </div>
        <dl className="kv">
          <dt>Valor</dt>
          <dd>{r.valor_estimado}</dd>
          <dt>Garantia</dt>
          <dd>{r.garantia}</dd>
          <dt>Entrega/execução</dt>
          <dd>{r.local_entrega_execucao}</dd>
        </dl>
        {r.prazos.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Prazos</h3>
            <table className="table">
              <tbody>
                {r.prazos.map((p, i) => (
                  <tr key={i}>
                    <td>{p.evento}</td>
                    <td className="r num nowrap">{p.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <h3>Documentos de habilitação</h3>
          <ul className="list small">
            {r.exigencias_habilitacao.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p className="xs subtle">Ao adicionar ao pipeline, esta lista vira o checklist do card.</p>
        </div>
        {r.pontos_de_atencao.length > 0 && (
          <div className="notice">
            <b>Pontos de atenção</b>
            <ul className="list" style={{ marginTop: 6 }}>
              {r.pontos_de_atencao.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="xs subtle">
          Gerado por IA a partir do{" "}
          {documento ? (
            <a className="link" href={documento} target="_blank" rel="noreferrer">
              documento publicado
            </a>
          ) : (
            "documento publicado"
          )}
          . Pode conter erros: confirme no edital antes de decidir.
        </p>
      </div>
    </div>
  );
}

export function ResumoIA({ editalId, inicial }: { editalId: string; inicial: ResumoState }) {
  const [state, action, pending] = useActionState(resumir, inicial);
  if (state?.resumo) return <ResumoView r={state.resumo} documento={state.documento} />;
  return (
    <form action={action} className="card card-body stack">
      <input type="hidden" name="edital" value={editalId} />
      <p className="muted">A IA lê o PDF do edital e extrai prazos, documentos de habilitação, exclusividade ME/EPP e pontos de atenção.</p>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Icon name="sparkles" size={14} /> {pending ? "Lendo o edital… (até 1 min)" : "Resumir edital com IA"}
        </button>
      </div>
      {state?.error && <div className="notice danger">{state.error}</div>}
    </form>
  );
}
