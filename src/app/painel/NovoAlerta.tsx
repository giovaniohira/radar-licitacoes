"use client";

import { useActionState, useRef } from "react";
import { criarAlerta } from "../actions";
import { MODALIDADES } from "@/lib/pncp";
import { SETORES, UFS } from "@/lib/setores";

export function NovoAlerta() {
  const [state, action, pending] = useActionState(criarAlerta, null);
  const palavras = useRef<HTMLTextAreaElement>(null);
  const nome = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="stack card">
      <label>
        Setor (preenche palavras-chave, você pode editar)
        <select
          defaultValue=""
          onChange={(ev) => {
            const s = SETORES.find((x) => x.id === ev.target.value);
            if (s && palavras.current && nome.current) {
              palavras.current.value = s.palavras;
              if (!nome.current.value) nome.current.value = s.nome;
            }
          }}
        >
          <option value="">Escolha um setor ou escreva abaixo</option>
          {SETORES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome} (CNAE {s.cnae})
            </option>
          ))}
        </select>
      </label>
      <label>
        Nome do alerta
        <input name="nome" ref={nome} maxLength={80} placeholder="ex.: Notebooks no Sul" />
      </label>
      <label>
        Palavras-chave (vírgula separa alternativas; -palavra exclui)
        <textarea name="palavras" ref={palavras} required placeholder="notebook, computador, impressora -locação" />
      </label>
      <div className="row2">
        <label>
          UFs (Ctrl/⌘ para várias; nenhuma = todas)
          <select name="uf" multiple>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Modalidades (nenhuma = todas)
          <select name="modalidade" multiple>
            {Object.entries(MODALIDADES)
              .filter(([id]) => id !== "9")
              .map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="row2">
        <label>
          Valor mínimo (R$)
          <input name="min" inputMode="decimal" placeholder="opcional" />
        </label>
        <label>
          Valor máximo (R$)
          <input name="max" inputMode="decimal" placeholder="opcional" />
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Criar alerta"}
        </button>
      </div>
      {state?.ok && <p className="success">{state.ok}</p>}
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
