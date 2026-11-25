"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import Form from "next/form";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { entrar, pedirLink } from "../actions/auth";

/** Terms acceptance next to every sign-in and sign-up button (docs/empresa/avisos-produto.md §3). */
export function Aceite({ verbo = "entrar" }: { verbo?: string }) {
  return (
    <p className="xs subtle" style={{ flexBasis: "100%", margin: 0 }}>
      Ao {verbo}, você aceita os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.
    </p>
  );
}

export const Seta = () => <Icon name="arrowRight" size={15} className="arr" />;

/**
 * "mm:ss" left until `ate` (epoch ms), ticking every second; null when it is over. The clock is read only after
 * mounting: prerendering a client component may not depend on the current time.
 */
export function useContagem(ate: number | null): string | null {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    if (!ate) return;
    const tick = () => setAgora(Date.now());
    const primeiro = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, [ate]);
  if (!ate || agora === null || ate <= agora) return null;
  const s = Math.ceil((ate - agora) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Password input with a "Mostrar/Ocultar" toggle inside the field (typing blind on a phone is the main source of
 * "wrong password"). A div, not a <label>: a label around the toggle and the link would put their text in the input's name.
 */
export function CampoSenha({
  name = "senha",
  label = "Senha",
  nova = false,
  autoFocus = false,
  extra,
  erro,
  disabled,
  inputRef,
}: {
  name?: string;
  label?: string;
  nova?: boolean;
  autoFocus?: boolean;
  extra?: ReactNode;
  erro?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [ver, setVer] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <span className="field-top">
        <label htmlFor={id}>{label}</label>
        {extra}
      </span>
      <span className="pw">
        <input
          id={id}
          ref={inputRef}
          className="input input-lg"
          name={name}
          type={ver ? "text" : "password"}
          required
          minLength={nova ? 8 : undefined}
          maxLength={200}
          autoComplete={nova ? "new-password" : "current-password"}
          placeholder={nova ? "Mínimo de 8 caracteres" : undefined}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
        />
        <button type="button" onClick={() => setVer((v) => !v)} aria-pressed={ver} aria-label={ver ? "Ocultar senha" : "Mostrar senha"} disabled={disabled}>
          {ver ? "Ocultar" : "Mostrar"}
        </button>
      </span>
      {erro && (
        <span className="erro" id={`${id}-erro`}>
          {erro}
        </span>
      )}
    </div>
  );
}

function CampoIdentificador({ valor, disabled, autoFocus }: { valor?: string; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <label className="field">
      E-mail ou CNPJ
      <input
        className="input input-lg"
        name="identificador"
        required
        inputMode="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={valor}
        key={valor}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </label>
  );
}

/** "Receber link": the same page with the password swapped out. One field, one button. */
function LinkForm({ valor, voltar }: { valor?: string; voltar: () => void }) {
  const [state, action, pending] = useActionState(pedirLink, null);
  return (
    <>
      <div>
        <h1>Entrar com link</h1>
        <p>Mandamos um link para o e-mail da conta. Vale 20 minutos.</p>
      </div>
      <form action={action} className="stack" style={{ gap: 16 }}>
        <CampoIdentificador valor={valor} autoFocus={!valor} />
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Enviando…" : "Receber link"} <Seta />
        </button>
        {state?.error && (
          <div className="notice" role="alert">
            {state.error}
          </div>
        )}
        <Aceite />
      </form>
      {state?.ok && (
        <div role="status" className="sent">
          <Icon name="check" size={18} />
          <span>
            <strong>Link enviado.</strong> {state.ok}
          </span>
        </div>
      )}
      <p className="auth-alt">
        <button type="button" className="link-btn" onClick={voltar}>
          Voltar para entrar com senha
        </button>
      </p>
    </>
  );
}

/** Sign in with e-mail or CNPJ and password; the magic link is one click away and takes over during a lockout. */
export function LoginForm({ link = false }: { link?: boolean }) {
  const [state, action, pending] = useActionState(entrar, null);
  const [modo, setModo] = useState<"senha" | "link">(link ? "link" : "senha");
  const senha = useRef<HTMLInputElement>(null);
  const contagem = useContagem(state?.ate ?? null);
  const bloqueado = !!contagem;

  // After a failed attempt the form resets: the password is empty again, so put the cursor there.
  useEffect(() => {
    if (state?.error && !state.ate) senha.current?.focus();
  }, [state]);

  if (modo === "link") return <LinkForm valor={state?.identificador} voltar={() => setModo("senha")} />;

  const botaoLink = (primario: boolean) => (
    <button type="button" className={`btn btn-block ${primario ? "btn-primary" : "btn-lg"}`} onClick={() => setModo("link")}>
      <Icon name="mail" size={16} /> Receber link de acesso por e-mail
    </button>
  );

  return (
    <>
      <div>
        <h1>Entrar</h1>
        <p>Com o e-mail ou o CNPJ da empresa.</p>
      </div>
      {state?.error && (
        <div className="notice" role="alert">
          {state.error}
        </div>
      )}
      {bloqueado && (
        <>
          {botaoLink(true)}
          <p className="ou">ou</p>
        </>
      )}
      <form action={action} className="stack" style={{ gap: 16, opacity: bloqueado ? 0.55 : undefined }}>
        <CampoIdentificador valor={state?.identificador} disabled={bloqueado} autoFocus={!state?.identificador} />
        <CampoSenha inputRef={senha} disabled={bloqueado} extra={bloqueado ? undefined : <Link href="/entrar/esqueci">Esqueci a senha</Link>} />
        {bloqueado ? (
          <button type="button" className="btn btn-block" disabled>
            Entrar <time className="xs" style={{ fontFamily: "var(--mono)" }}>em {contagem}</time>
          </button>
        ) : (
          <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"} <Seta />
          </button>
        )}
      </form>
      {!bloqueado && (
        <>
          <p className="ou">ou</p>
          {botaoLink(false)}
          <p className="auth-alt">
            Ainda não tem conta? <Link href="/criar-conta">Criar conta grátis</Link>
          </p>
        </>
      )}
    </>
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
