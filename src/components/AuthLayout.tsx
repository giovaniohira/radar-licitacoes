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
        <h2>Seu primeiro alerta em poucos minutos.</h2>
        <ol>
          <li>
            <span>1</span>Informe o CNPJ: já marcamos seu ramo e seu estado.
          </li>
          <li>
            <span>2</span>Ajuste o que você vende, os estados e o tamanho de contrato.
          </li>
          <li>
            <span>3</span>Todo dia às 7h, os editais novos chegam no seu e-mail.
          </li>
        </ol>
      </aside>
    </main>
  );
}
