import type { ReactNode } from "react";
import { Logo } from "./icons";

/** Split sign-in layout: the form on the left, what happens next on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="conteudo" className="auth">
      <section className="auth-main">
        <Logo />
        <div className="auth-box">
          <div>{children}</div>
        </div>
      </section>
      <aside className="auth-aside">
        <h2>Seu primeiro alerta em 4 perguntas.</h2>
        <ol>
          <li>
            <span>1</span>Diga o que sua empresa vende.
          </li>
          <li>
            <span>2</span>Escolha os estados e o tamanho de contrato.
          </li>
          <li>
            <span>3</span>Todo dia às 7h, os editais novos chegam no seu e-mail.
          </li>
        </ol>
      </aside>
    </main>
  );
}
