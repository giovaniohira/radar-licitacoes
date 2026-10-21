"use client";

import { useActionState } from "react";
import { pedirLink } from "../../actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(pedirLink, null);
  if (state?.ok) return <div className="notice ok">{state.ok}</div>;
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>E-mail de trabalho</span>
        <input className="input" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Receber link de acesso"}
      </button>
      {state?.error && <div className="notice danger">{state.error}</div>}
    </form>
  );
}
