"use client";

import { useActionState } from "react";
import { resumir, type ResumoState } from "../../actions";
import type { Resumo } from "@/lib/summary";

function ResumoView({ r, documento }: { r: Resumo; documento?: string }) {
  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <dl className="kv">
        <dt>Objeto</dt>
        <dd>{r.objeto}</dd>
        <dt>Valor</dt>
        <dd>{r.valor_estimado}</dd>
        <dt>ME/EPP</dt>
        <dd>{r.exclusivo_me_epp ? <span className="pill">Exclusivo ou cota para ME/EPP</span> : "Ampla concorrência"}</dd>
        <dt>Julgamento</dt>
        <dd>{r.criterio_julgamento}</dd>
        <dt>Garantia</dt>
        <dd>{r.garantia}</dd>
        <dt>Entrega/execução</dt>
        <dd>{r.local_entrega_execucao}</dd>
      </dl>
      {r.prazos.length > 0 && (
        <div>
          <b>Prazos</b>
          <ul className="clean">
            {r.prazos.map((p, i) => (
              <li key={i}>
                {p.evento}: <b>{p.data}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <b>Habilitação</b>
        <ul className="clean">
          {r.exigencias_habilitacao.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      {r.pontos_de_atencao.length > 0 && (
        <div className="notice">
          <b>Pontos de atenção</b>
          <ul className="clean">
            {r.pontos_de_atencao.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Resumo gerado por IA a partir do{" "}
        {documento ? (
          <a href={documento} target="_blank" rel="noreferrer">
            documento publicado
          </a>
        ) : (
          "documento publicado"
        )}
        . Pode conter erros: confirme no edital antes de decidir.
      </p>
    </div>
  );
}

export function ResumoIA({ editalId, inicial }: { editalId: string; inicial: ResumoState }) {
  const [state, action, pending] = useActionState(resumir, inicial);
  if (state?.resumo) return <ResumoView r={state.resumo} documento={state.documento} />;
  return (
    <form action={action} className="card">
      <input type="hidden" name="edital" value={editalId} />
      <p className="muted" style={{ marginTop: 0 }}>
        A IA lê o PDF do edital e extrai prazos, documentos de habilitação, exclusividade ME/EPP e pontos de atenção.
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Lendo o edital… (até 1 min)" : "Resumir edital com IA"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
