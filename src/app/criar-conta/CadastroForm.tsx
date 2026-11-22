"use client";

import { useActionState, useState } from "react";
import { criarConta } from "../actions/auth";
import { Aceite, CampoSenha, ConfirmeEmail } from "../entrar/LoginForm";

export function CadastroForm({ email: inicial }: { email: string }) {
  const [state, action, pending] = useActionState(criarConta, null);
  // Kept across a failed submit, which would otherwise reset the uncontrolled inputs.
  const [email, setEmail] = useState(inicial);
  const [cnpj, setCnpj] = useState("");
  if (state?.ok) return <ConfirmeEmail email={state.ok} />;
  return (
    <form action={action} className="stack">
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
        />
      </label>
      <label className="field">
        CNPJ da empresa
        <input
          className="input input-lg"
          name="cnpj"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          placeholder="00.000.000/0000-00"
          autoFocus={!!inicial}
        />
        <span className="hint">Você também pode entrar com ele no lugar do e-mail.</span>
      </label>
      <CampoSenha nova />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Criando…" : "Criar conta"}
      </button>
      {state?.error && <div className="notice">{state.error}</div>}
      <Aceite verbo="criar a conta" />
    </form>
  );
}
