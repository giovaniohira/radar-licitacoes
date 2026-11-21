"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { pedirLink } from "../actions/auth";

/** E-mail-only sign-in. `hero` is the inline version on the landing page. */
export function LoginForm({ variante }: { variante?: "hero" }) {
  const [state, action, pending] = useActionState(pedirLink, null);
  if (state?.ok) {
    return (
      <div role="status" className="sent" style={variante ? { maxWidth: 520 } : undefined}>
        <Icon name="check" size={18} />
        <span>
          <strong>Link enviado.</strong> {state.ok} Abra o e-mail neste aparelho e clique em “Entrar”.
        </span>
      </div>
    );
  }
  if (variante === "hero") {
    return (
      <form action={action} className="hero-form">
        <label htmlFor="hero-email" className="sr-only">
          E-mail de trabalho
        </label>
        <input id="hero-email" className="input" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Enviando…" : "Receber link de acesso"}
        </button>
        {state?.error && <div className="notice" style={{ flexBasis: "100%" }}>{state.error}</div>}
      </form>
    );
  }
  return (
    <form action={action} className="stack">
      <label className="field">
        E-mail de trabalho
        <input className="input input-lg" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Receber link de acesso"}
      </button>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
