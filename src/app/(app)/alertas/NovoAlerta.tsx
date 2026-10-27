"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { Icon } from "@/components/icons";
import { editalHref } from "@/components/ui";
import { formatInt, frase, nome } from "@/lib/format";
import { MODALIDADES } from "@/lib/pncp";
import { SETORES, UFS } from "@/lib/setores";
import { criarAlerta, previewAlerta } from "../../actions/alertas";

export function NovoAlerta() {
  const [state, action, pending] = useActionState(criarAlerta, null);
  const [preview, previewAction, previewing] = useActionState(previewAlerta, null);
  const palavras = useRef<HTMLTextAreaElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="card">
      <div className="card-head">
        <h2>Novo alerta</h2>
      </div>
      <div className="card-body stack">
        <div className="field">
          <span>Comece por um setor (preenche as palavras-chave)</span>
          <div className="row">
            {SETORES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (palavras.current) palavras.current.value = s.palavras;
                  if (nomeRef.current && !nomeRef.current.value) nomeRef.current.value = s.nome;
                }}
              >
                {s.nome}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Nome</span>
          <input className="input" name="nome" ref={nomeRef} maxLength={80} placeholder="ex.: Notebooks no Sul" />
        </label>
        <label className="field">
          <span>Palavras-chave · vírgula separa alternativas, -palavra exclui</span>
          <textarea className="input" name="palavras" ref={palavras} required placeholder="notebook, computador portátil, impressora -locação" />
        </label>
        <div className="field">
          <span>Estados (nenhum = Brasil inteiro)</span>
          <div className="chips">
            {UFS.map((u) => (
              <label key={u} className="chip">
                <input type="checkbox" name="uf" value={u} />
                <span>{u}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Modalidades (nenhuma = todas)</span>
          <div className="chips">
            {Object.entries(MODALIDADES)
              .filter(([id]) => id !== "9")
              .map(([id, n]) => (
                <label key={id} className="chip">
                  <input type="checkbox" name="modalidade" value={id} />
                  <span>{n}</span>
                </label>
              ))}
          </div>
        </div>
        <div className="grid g2">
          <label className="field">
            <span>Valor mínimo (R$)</span>
            <input className="input" name="min" inputMode="decimal" placeholder="opcional" />
          </label>
          <label className="field">
            <span>Valor máximo (R$)</span>
            <input className="input" name="max" inputMode="decimal" placeholder="opcional" />
          </label>
        </div>

        {preview && (
          <div className="notice info stack" style={{ gap: 6 }}>
            <b>{formatInt(preview.total)} editais abertos batem com este alerta agora.</b>
            {preview.exemplos.slice(0, 3).map((e) => (
              <Link key={e.id} href={editalHref(e.id)} className="small" target="_blank">
                · {frase(e.objeto).slice(0, 110)} ({nome(e.orgao)}, {e.uf})
              </Link>
            ))}
          </div>
        )}
        {state?.ok && <div className="notice ok">{state.ok}</div>}
        {state?.error && <div className="notice danger">{state.error}</div>}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Icon name="bell" size={14} /> {pending ? "Salvando…" : "Criar alerta"}
          </button>
          <button className="btn" formAction={previewAction} disabled={previewing} formNoValidate>
            {previewing ? "Contando…" : "Pré-visualizar resultados"}
          </button>
        </div>
      </div>
    </form>
  );
}
