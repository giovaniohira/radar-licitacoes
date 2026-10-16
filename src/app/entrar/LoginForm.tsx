"use client";

import { useActionState } from "react";
import { pedirLink } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(pedirLink, null);
  return (
    <form action={action} className="stack">
      <label>
        E-mail
        <input name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
      </label>
      <div>
        <button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Receber link de acesso"}
        </button>
      </div>
      {state?.ok && <p className="success">{state.ok}</p>}
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
