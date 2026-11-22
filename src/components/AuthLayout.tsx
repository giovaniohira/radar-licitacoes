import type { ReactNode } from "react";
import { DIAS_TESTE } from "@/lib/empresa";
import { Logo } from "./icons";

const CADASTRO = ["Crie sua conta com e-mail e senha.", "Confirme o e-mail pelo link que mandamos.", "Diga o CNPJ: o ramo e os estados vêm preenchidos."];
const ENTRAR = ["Entre com o e-mail ou o CNPJ da empresa.", "Sem senha à mão? Receba um link no e-mail.", "O Hoje mostra o que chegou e o que vence."];

/**
 * Split sign-in layout: the form on the left, the ink panel on the right (hidden on phones).
 * `passo` turns the panel into the sign-up progress (0 = criar conta, 1 = confirmar e-mail); without it, the sign-in panel.
 */
export function AuthLayout({ children, passo }: { children: ReactNode; passo?: number }) {
  const cadastro = passo !== undefined;
  const itens = cadastro ? CADASTRO : ENTRAR;
  return (
    <main id="conteudo" className="auth">
      <section className="auth-main">
        <Logo />
        <div className="auth-box">
          <div>{children}</div>
        </div>
      </section>
      <aside className="auth-aside">
        <h2>{cadastro ? "Seu primeiro alerta em 3 passos." : "Os editais do seu ramo, todo dia às 7h."}</h2>
        <ol>
          {itens.map((t, i) => (
            <li key={t} className={cadastro ? (i < passo ? "feito" : i === passo ? "atual" : undefined) : undefined} aria-current={cadastro && i === passo ? "step" : undefined}>
              <span>{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        {cadastro && <p className="nota">{DIAS_TESTE} dias grátis, sem cartão. Um teste por CNPJ.</p>}
      </aside>
    </main>
  );
}
