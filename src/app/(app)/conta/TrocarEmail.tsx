"use client";

import { useActionState } from "react";
import { trocarEmail } from "../../actions/auth";

export function TrocarEmail() {
  const [state, action, pending] = useActionState(trocarEmail, null);
  if (state?.ok) return <div className="notice ok">{state.ok}</div>;
  return (
    <form action={action} className="stack" style={{ maxWidth: 420 }}>
      <label className="field">
        <span>Novo e-mail</span>
        <input className="input" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
      </label>
      <div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Enviando…" : "Enviar link de confirmação"}
        </button>
      </div>
      {state?.error && <div className="notice danger">{state.error}</div>}
    </form>
  );
}
