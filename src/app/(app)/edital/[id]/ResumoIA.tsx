"use client";

import { useActionState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { Resumo } from "@/lib/summary";
import { resumir, type ResumoState } from "../../../actions/resumo";

function Cabecalho({ sub }: { sub: string }) {
  return (
    <div className="ia-head">
      <div className="row">
        <Icon name="sparkle" size={18} />
        <h2>O que você precisa saber</h2>
      </div>
      <p>{sub}</p>
    </div>
  );
}

function Pergunta({ p, alerta, children }: { p: string; alerta?: boolean; children: ReactNode }) {
  return (
    <div className={`qa${alerta ? " alerta" : ""}`}>
      <span className="mk" aria-hidden>
        {alerta ? "!" : "?"}
      </span>
      <div>
        <h3>{p}</h3>
        {children}
      </div>
    </div>
  );
}

function ResumoView({ r, documento, detalhes }: { r: Resumo; documento?: string; detalhes: ReactNode }) {
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <Cabecalho sub="A IA leu o PDF do edital. Confira no original antes de enviar." />
      <Pergunta p="O que estão comprando?">
        <p>{r.objeto}</p>
      </Pergunta>
      <Pergunta p="Posso participar como ME/EPP?">
        <p>{r.exclusivo_me_epp ? "Sim. Há participação exclusiva ou cota reservada para micro e pequenas empresas." : "Não há cota exclusiva: a disputa é de ampla concorrência."}</p>
      </Pergunta>
      <Pergunta p="Tem alguma pegadinha?" alerta={r.pontos_de_atencao.length > 0}>
        {r.pontos_de_atencao.length ? (
          <ul>
            {r.pontos_de_atencao.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          <p>Nenhum ponto de atenção encontrado no edital.</p>
        )}
      </Pergunta>
      {r.prazos.length > 0 && (
        <Pergunta p="Quais são as datas?">
          <ul>
            {r.prazos.map((p, i) => (
              <li key={i}>
                <span className="num">{p.data}</span> · {p.evento}
              </li>
            ))}
          </ul>
        </Pergunta>
      )}
      <Pergunta p="Onde entregar e qual garantia?">
        <p>
          {r.local_entrega_execucao}. Garantia: {r.garantia}. Ganha quem: {r.criterio_julgamento}.
        </p>
      </Pergunta>
      <div className="ia-foot">
        {documento && (
          <a href={documento} target="_blank" rel="noreferrer">
            Abrir o documento que a IA leu
          </a>
        )}
        {detalhes}
      </div>
    </section>
  );
}

export function ResumoIA({ editalId, inicial, logado, detalhes }: { editalId: string; inicial: ResumoState; logado: boolean; detalhes: ReactNode }) {
  const [state, action, pending] = useActionState(resumir, inicial);
  if (state?.resumo) return <ResumoView r={state.resumo} documento={state.documento} detalhes={detalhes} />;
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <Cabecalho sub="A IA lê o PDF do edital e responde: prazos, documentos de habilitação, cota ME/EPP, garantia e as pegadinhas." />
      <div className="ia-foot" style={{ paddingBlock: 16 }}>
        {logado ? (
          <form action={action}>
            <input type="hidden" name="edital" value={editalId} />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              <Icon name="sparkle" size={15} /> {pending ? "Lendo o edital… (até 1 min)" : "Resumir edital com IA"}
            </button>
          </form>
        ) : (
          <a className="btn btn-primary" href="/entrar" style={{ width: "fit-content" }}>
            Entre para resumir com IA
          </a>
        )}
        {state?.error && <div className="notice">{state.error}</div>}
        {detalhes}
      </div>
    </section>
  );
}
