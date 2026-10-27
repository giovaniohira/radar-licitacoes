import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { first } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { excluirConta, sairDeTodos } from "../../actions/auth";
import { TrocarEmail } from "./TrocarEmail";

export const metadata: Metadata = { title: "Conta" };

async function Conta({ searchParams }: PageProps<"/conta">) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <div className="page">
      <PageHead title="Conta" sub={`Você entra com ${user.email}, sem senha: mandamos um link de acesso a cada login.`} />
      {first(sp.ok) && <div className="notice ok" style={{ marginBottom: 16 }}>E-mail atualizado.</div>}
      {first(sp.erro) && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          Não deu para trocar: esse e-mail passou a ter outra conta no Radar.
        </div>
      )}
      <div className="stack-lg">
        <section className="card">
          <div className="card-head">
            <h2>E-mail</h2>
          </div>
          <div className="card-body stack">
            <p className="muted small">
              Alertas e links de acesso vão para <b>{user.email}</b>. Para trocar, confirme o novo endereço pelo link que mandamos para ele.
            </p>
            <TrocarEmail />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Sessões</h2>
          </div>
          <form action={sairDeTodos} className="card-body stack">
            <p className="muted small">Desconecta este e todos os outros navegadores onde você entrou. Use se perdeu um aparelho ou entrou num computador compartilhado.</p>
            <div>
              <SubmitButton className="btn">Sair de todos os dispositivos</SubmitButton>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Excluir conta</h2>
          </div>
          <form action={excluirConta} className="card-body stack">
            <p className="muted small">Apaga sua conta, alertas, pipeline, checklists e notas. Não dá para desfazer.</p>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" name="confirmar" required />
              Entendo que isso apaga tudo permanentemente.
            </label>
            <div>
              <SubmitButton className="btn btn-danger">Excluir minha conta</SubmitButton>
            </div>
          </form>
        </section>
      </div>
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
