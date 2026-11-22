import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { icsToken } from "@/lib/auth";
import { first } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { excluirConta, sairDeTodos } from "../../actions/auth";
import { CopiarAgenda, TrocarEmail } from "./TrocarEmail";

export const metadata: Metadata = { title: "Conta", robots: { index: false } };

async function Conta({ searchParams }: PageProps<"/conta">) {
  const user = await requireUser();
  const sp = await searchParams;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const ics = `${appUrl}/pipeline.ics?u=${user.id}&t=${icsToken(user.id)}`;
  return (
    <div className="page narrow" style={{ gap: 20 }}>
      <PageHead title="Conta" sub="Não tem senha. Para entrar, você recebe um link no seu e-mail." />
      {first(sp.ok) && <div className="notice ok">E-mail atualizado.</div>}
      {first(sp.erro) && <div className="notice">Não deu para trocar: esse e-mail passou a ter outra conta no Vencedital.</div>}

      <section className="card">
        <div className="card-head">
          <h2>E-mail</h2>
        </div>
        <div className="sec-body vert">
          <p className="small muted">É para onde vão os links de acesso e o e-mail diário dos alertas, às 7h. Para trocar, confirme o novo endereço pelo link que mandamos para ele.</p>
          <TrocarEmail atual={user.email} />
        </div>
      </section>

      <section id="agenda" className="card">
        <div className="card-head">
          <h2>Agenda</h2>
        </div>
        <div className="sec-body">
          <p>
            Os prazos de proposta de Minhas disputas aparecem no seu Google Agenda ou Outlook, com aviso um dia antes. No Google Agenda: Outras agendas → Do URL, e cole o
            link.
          </p>
          <CopiarAgenda url={ics} />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Sessões</h2>
        </div>
        <form action={sairDeTodos} className="sec-body">
          <p>Desconecta este e todos os outros navegadores onde você entrou. Use se perdeu um aparelho ou entrou num computador compartilhado.</p>
          <SubmitButton className="btn">Sair de todos os dispositivos</SubmitButton>
        </form>
      </section>

      <section className="card perigo">
        <div className="card-head">
          <h2>Excluir conta</h2>
        </div>
        <form action={excluirConta} className="sec-body vert">
          <p className="small muted">Apaga sua conta, alertas, disputas, checklists e notas. Não dá para desfazer.</p>
          <label className="check">
            <input type="checkbox" name="confirmar" required style={{ accentColor: "var(--danger)" }} />
            Entendi que isso apaga tudo
          </label>
          <div>
            <SubmitButton className="btn btn-danger">Excluir minha conta</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Page(props: PageProps<"/conta">) {
  return (
    <Suspense fallback={<Loading />}>
      <Conta {...props} />
    </Suspense>
  );
}
