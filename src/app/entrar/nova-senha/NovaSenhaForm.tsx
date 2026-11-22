"use client";

import { useActionState } from "react";
import { novaSenha } from "../../actions/auth";
import { CampoSenha } from "../LoginForm";

export function NovaSenhaForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(novaSenha, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      <CampoSenha label="Nova senha" nova autoFocus />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando…" : "Salvar e entrar"}
      </button>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
