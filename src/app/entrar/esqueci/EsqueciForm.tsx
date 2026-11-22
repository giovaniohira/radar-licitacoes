"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { esqueciSenha } from "../../actions/auth";
import { Seta } from "../LoginForm";

export function EsqueciForm() {
  const [state, action, pending] = useActionState(esqueciSenha, null);
  return (
    <>
      <form action={action} className="stack" style={{ gap: 16 }}>
        <label className="field">
          E-mail ou CNPJ
          <input className="input input-lg" name="identificador" required inputMode="text" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Enviando…" : "Enviar link"} <Seta />
        </button>
        {state?.error && (
          <div className="notice" role="alert">
            {state.error}
          </div>
        )}
      </form>
      {state?.ok && (
        <div role="status" className="sent">
          <Icon name="check" size={18} />
          <span>
            <strong>Pronto.</strong> {state.ok}
          </span>
        </div>
      )}
    </>
  );
}
