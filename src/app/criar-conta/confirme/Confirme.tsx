"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { confirmouNesteNavegador, reenviarVerificacao } from "../../actions/auth";
import { useContagem } from "../../entrar/LoginForm";


/** Webmail shortcut by domain. Company domains (Google Workspace, Microsoft 365, others) get none: we can't tell which. */
function caixaDeEntrada(email: string): { nome: string; url: string } | null {
  const dominio = email.split("@")[1] ?? "";
  if (/^(gmail|googlemail)\.com$/.test(dominio)) return { nome: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" };
  if (/^(outlook|hotmail|live|msn)\.com(\.br)?$/.test(dominio)) return { nome: "Outlook", url: "https://outlook.live.com/mail/0/" };
  if (/^(yahoo|ymail)\.com(\.br)?$/.test(dominio)) return { nome: "Yahoo Mail", url: "https://mail.yahoo.com/" };
  return null;
}

/** `reenvioApos`: when the first resend is allowed (epoch ms), set by the server: the link was just sent. */
export function Confirme({ email, reenvioApos }: { email: string; reenvioApos: number }) {
  const router = useRouter();
  const [state, reenviar, pending] = useActionState(reenviarVerificacao, null);
  // After a resend the server says when the next one is allowed.
  const contagem = useContagem(state?.ate ?? reenvioApos);
  const caixa = caixaDeEntrada(email);

  // When the link is opened in this same browser (another tab), this page moves on by itself.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState === "visible" && (await confirmouNesteNavegador())) router.push("/boas-vindas");
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <>
      <div>
        <p className="kicker">Passo 2 de 3</p>
        <h1>Confirme seu e-mail</h1>
        <p>Mandamos um link para o endereço abaixo. Abra o e-mail e clique em “Confirmar e-mail”.</p>
      </div>
      <span className="email-chip">{email}</span>
      {caixa && (
        <a className="btn btn-primary btn-block" href={caixa.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={15} /> Abrir o {caixa.nome}
        </a>
      )}
      <div className="reenvio">
        <span>Não chegou? Veja o spam{caixa?.nome === "Gmail" ? " e a aba Promoções" : ""}.</span>
      </div>
      <div className="reenvio">
        <form action={reenviar} className="row">
          <button type="submit" className="link-btn" disabled={pending || !!contagem}>
            {pending ? "Enviando…" : "Reenviar link"}
          </button>{" "}
          {contagem && <time>em {contagem}</time>}
        </form>
        <Link href={`/criar-conta?email=${encodeURIComponent(email)}`}>Trocar e-mail</Link>
      </div>
      {state?.ok && (
        <div className="notice ok" role="status">
          {state.ok}
        </div>
      )}
      {state?.error && (
        <div className="notice" role="alert">
          {state.error}
        </div>
      )}
      <p className="aguardando" aria-live="polite">
        Esta página continua sozinha quando você confirmar neste navegador
      </p>
    </>
  );
}
