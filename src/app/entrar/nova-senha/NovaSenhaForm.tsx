"use client";

import { useActionState } from "react";
import { novaSenha } from "../../actions/auth";
import { CampoSenha, Seta } from "../LoginForm";

export function NovaSenhaForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(novaSenha, null);
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new password for the right account. */}
      <input type="text" name="usuario" autoComplete="username" value={email} hidden readOnly />
      <CampoSenha label="Nova senha" nova autoFocus erro={state?.error} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Salvando…" : "Salvar e entrar"} <Seta />
      </button>
    </form>
  );
}
