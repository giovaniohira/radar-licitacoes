"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { esqueciSenha } from "../../actions/auth";

export function EsqueciForm() {
  const [state, action, pending] = useActionState(esqueciSenha, null);
  if (state?.ok) {
    return (
      <div role="status" className="sent">
        <Icon name="check" size={18} />
        <span>{state.ok}</span>
      </div>
    );
  }
  return (
    <form action={action} className="stack">
      <label className="field">
        E-mail ou CNPJ
        <input className="input input-lg" name="identificador" required autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link"}
      </button>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
