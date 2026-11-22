"use client";

import { useActionState, useId, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { entrar, pedirLink, reenviarVerificacao } from "../actions/auth";

/** Terms acceptance next to every sign-in and sign-up button (docs/empresa/avisos-produto.md §3). */
export function Aceite({ verbo = "entrar" }: { verbo?: string }) {
  return (
    <p className="xs subtle" style={{ flexBasis: "100%", margin: 0 }}>
      Ao {verbo}, você aceita os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.
    </p>
  );
}

/** Password input with a show/hide toggle: typing blind on a phone is the main source of "wrong password". */
export function CampoSenha({ name = "senha", label = "Senha", nova = false, autoFocus = false }: { name?: string; label?: string; nova?: boolean; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  const id = useId();
  // A div, not a <label>: a label wrapping the toggle button would name the button instead of the input.
  return (
    <div className="field">
      <span className="row" style={{ justifyContent: "space-between" }}>
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setVer((v) => !v)}
          aria-pressed={ver}
          aria-label={ver ? "Esconder senha" : "Mostrar senha"}
          style={{ padding: "0 6px", height: "auto" }}
        >
          {ver ? "Esconder" : "Mostrar"}
        </button>
      </span>
      <input
        id={id}
        className="input input-lg"
        name={name}
        type={ver ? "text" : "password"}
        required
        minLength={nova ? 8 : undefined}
        maxLength={200}
        autoComplete={nova ? "new-password" : "current-password"}
        autoFocus={autoFocus}
      />
      {nova && <span className="hint">Pelo menos 8 caracteres.</span>}
    </div>
  );
}

/** "Check your inbox" after sign-up or after a password sign-in on an unconfirmed account, with a resend button. */
export function ConfirmeEmail({ email }: { email: string }) {
  const [state, action, pending] = useActionState(reenviarVerificacao, null);
  return (
    <div className="stack">
      <div role="status" className="sent">
        <Icon name="check" size={18} />
        <span>
          <strong>Falta só confirmar seu e-mail.</strong> Enviamos um link para <b>{email}</b>. Abra o e-mail e clique em “Confirmar e-mail” para entrar.
        </span>
      </div>
      <form action={action} className="row" style={{ gap: 8, alignItems: "center" }}>
        <input type="hidden" name="email" value={email} />
        <span className="small subtle">Não chegou? Confira o spam ou</span>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Enviando…" : "envie de novo"}
        </button>
      </form>
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      {state?.error && <div className="notice">{state.error}</div>}
    </div>
  );
}

/** Magic link: no password needed. Also creates the account for a new address, as before. */
export function LinkForm({ email = "" }: { email?: string }) {
  const [state, action, pending] = useActionState(pedirLink, null);
  if (state?.ok) {
    return (
      <div role="status" className="sent">
        <Icon name="check" size={18} />
        <span>
          <strong>Link enviado.</strong> {state.ok} Abra o e-mail neste aparelho e clique em “Entrar”.
        </span>
      </div>
    );
  }
  return (
    <form action={action} className="stack">
      <label className="field">
        E-mail
        <input className="input input-lg" name="email" type="email" required autoComplete="email" defaultValue={email} placeholder="voce@empresa.com.br" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Receber link de acesso"}
      </button>
      {state?.error && <div className="notice">{state.error}</div>}
      <Aceite />
    </form>
  );
}

/** Sign in with e-mail or CNPJ and password; one click switches to the magic link. */
export function LoginForm() {
  const [state, action, pending] = useActionState(entrar, null);
  const [modo, setModo] = useState<"senha" | "link">("senha");
  if (state?.pendente) return <ConfirmeEmail email={state.pendente} />;
  if (modo === "link") {
    return (
      <div className="stack">
        <LinkForm email={state?.identificador?.includes("@") ? state.identificador : ""} />
        <button type="button" className="btn btn-ghost" onClick={() => setModo("senha")}>
          Entrar com senha
        </button>
      </div>
    );
  }
  return (
    <div className="stack">
      <form action={action} className="stack">
        <label className="field">
          E-mail ou CNPJ
          <input
            className="input input-lg"
            name="identificador"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state?.identificador}
            key={state?.identificador}
            placeholder="voce@empresa.com.br ou 00.000.000/0000-00"
          />
        </label>
        <CampoSenha />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
        {state?.error && (
          <div className="notice">
            {state.error} Se você sempre entrou pelo link no e-mail, use “Entrar sem senha” ou crie uma senha em “Esqueci a senha”.
          </div>
        )}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link href="/entrar/esqueci" className="small">
            Esqueci a senha
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModo("link")}>
            Entrar sem senha, com link no e-mail
          </button>
        </div>
        <Aceite />
      </form>
    </div>
  );
}

/** The landing page's inline form: the e-mail goes to /criar-conta, already filled in. */
export function HeroCadastro() {
  return (
    <Form action="/criar-conta" className="hero-form">
      <label htmlFor="hero-email" className="sr-only">
        E-mail de trabalho
      </label>
      <input id="hero-email" className="input" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
      <button type="submit" className="btn btn-primary">
        Começar teste grátis
      </button>
    </Form>
  );
}
