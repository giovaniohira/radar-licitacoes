"use client";

import { useActionState, useState } from "react";
import { criarConta } from "../actions/auth";
import { Aceite, CampoSenha, Seta } from "../entrar/LoginForm";

/** E-mail and password only; the CNPJ comes in the onboarding. On success the action moves on to /criar-conta/confirme. */
export function CadastroForm({ email: inicial }: { email: string }) {
  const [state, action, pending] = useActionState(criarConta, null);
  // Kept across a failed submit, which would otherwise reset the uncontrolled input.
  const [email, setEmail] = useState(inicial);
  const erroEmail = state?.campo === "email" ? state.error : undefined;
  const erroSenha = state?.campo === "senha" ? state.error : undefined;
  return (
    <form action={action} className="stack" style={{ gap: 16 }} noValidate>
      <label className="field">
        E-mail de trabalho
        <input
          className="input input-lg"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com.br"
          autoFocus={!inicial}
          aria-invalid={erroEmail ? true : undefined}
          aria-describedby={erroEmail ? "erro-email" : undefined}
        />
        {erroEmail && (
          <span className="erro" id="erro-email">
            {erroEmail}
          </span>
        )}
      </label>
      {/* From the hero the e-mail is already there, so the cursor starts in the password. */}
      <CampoSenha nova autoFocus={!!inicial} erro={erroSenha} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Criando…" : "Criar conta"} <Seta />
      </button>
      {state?.error && !state.campo && (
        <div className="notice" role="alert">
          {state.error}
        </div>
      )}
      <Aceite verbo="criar a conta" />
    </form>
  );
}
