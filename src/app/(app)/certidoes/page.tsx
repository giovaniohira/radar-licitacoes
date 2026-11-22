import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Loading, PageHead } from "@/components/ui";
import { MAX_OUTRAS, TIPOS_FIXOS, estadoDaCertidao, hojeBR, listarCertidoes, nomeDaCertidao, type Certidao } from "@/lib/certidoes";
import { pool } from "@/lib/db";
import { first } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { apagarCertidaoForm, salvarCertidaoForm } from "../../actions/certidoes";

export const metadata: Metadata = { title: "Certidões", robots: { index: false } };

function Estado({ c, hoje }: { c: Certidao; hoje: string }) {
  const e = estadoDaCertidao(c.valida_ate, hoje);
  return <span className={`pill cert-${e.tom}`}>{e.texto}</span>;
}

function Apagar({ id, rotulo }: { id: number; rotulo: string }) {
  return (
    <form action={apagarCertidaoForm}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn btn-ghost btn-sm" aria-label={`Apagar ${rotulo}`}>
        Apagar
      </SubmitButton>
    </form>
  );
}

async function Certidoes({ searchParams }: PageProps<"/certidoes">) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const hoje = hojeBR();
  const todas = await listarCertidoes(pool(), user.id);
  const fixas = new Map(todas.filter((c) => c.tipo !== "outra").map((c) => [c.tipo, c]));
  const outras = todas.filter((c) => c.tipo === "outra");

  return (
    <div className="page narrow" style={{ gap: 20 }}>
      <PageHead
        title="Certidões"
        sub="Cadastre até quando cada certidão vale. O Vencedital avisa por e-mail 7, 3 e 1 dia antes de vencer, e no dia, e marca as disputas cuja sessão cai depois do vencimento."
      />
      {first(sp.erro) && <div className="notice">{first(sp.erro)}</div>}
      {first(sp.ok) && <div className="notice ok">Certidão salva.</div>}
      {first(sp.apagada) && <div className="notice ok">Certidão apagada.</div>}

      <section className="card" aria-label="Certidões fixas">
        <div className="card-head">
          <h2>As cinco de sempre</h2>
          <span className="xs subtle">Só a data: não guardamos o arquivo.</span>
        </div>
        <ul className="cert-lista">
          {TIPOS_FIXOS.map((t) => {
            const c = fixas.get(t.id);
            return (
              <li key={t.id} id={t.id} className="cert-linha">
                <div className="cert-nome">
                  <b>{t.nome}</b>
                  {c ? <Estado c={c} hoje={hoje} /> : <span className="pill">sem data</span>}
                </div>
                <form action={salvarCertidaoForm} className="cert-form">
                  <input type="hidden" name="tipo" value={t.id} />
                  <label className="cert-data">
                    <span className="sr-only">Válida até, {t.nome}</span>
                    <span className="xs muted">Válida até</span>
                    <input className="input" type="date" name="valida_ate" defaultValue={c?.valida_ate ?? ""} required min="2000-01-01" max="2100-12-31" />
                  </label>
                  <SubmitButton className="btn btn-primary btn-sm">Salvar</SubmitButton>
                </form>
                <div className="cert-acoes">
                  {t.link ? (
                    <a href={t.link} target="_blank" rel="noreferrer" className="small">
                      Emitir <Icon name="external" size={13} />
                    </a>
                  ) : (
                    <span className="xs subtle">cada {t.id === "estadual" ? "estado" : "prefeitura"} tem o seu site</span>
                  )}
                  {c && <Apagar id={c.id} rotulo={t.nome} />}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-label="Outras certidões" id="outra">
        <div className="card-head">
          <h2>Outras</h2>
          <span className="xs subtle">Atestados, alvarás, registros.</span>
        </div>
        {outras.length > 0 && (
          <ul className="cert-lista">
            {outras.map((c) => (
              <li key={c.id} className="cert-linha">
                <div className="cert-nome">
                  <b>{nomeDaCertidao(c)}</b>
                  <Estado c={c} hoje={hoje} />
                </div>
                <form action={salvarCertidaoForm} className="cert-form">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="tipo" value="outra" />
                  <label className="cert-data">
                    <span className="sr-only">Válida até, {nomeDaCertidao(c)}</span>
                    <span className="xs muted">Válida até</span>
                    <input className="input" type="date" name="valida_ate" defaultValue={c.valida_ate} required min="2000-01-01" max="2100-12-31" />
                  </label>
                  <SubmitButton className="btn btn-sm">Salvar</SubmitButton>
                </form>
                <div className="cert-acoes">
                  <Apagar id={c.id} rotulo={nomeDaCertidao(c)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {outras.length < MAX_OUTRAS && (
          <form action={salvarCertidaoForm} className="cert-nova">
            <input type="hidden" name="tipo" value="outra" />
            <label className="field" style={{ flex: "2 1 220px" }}>
              Nome
              <input className="input" name="nome" maxLength={60} placeholder="ex.: Alvará de funcionamento" required />
            </label>
            <label className="field" style={{ flex: "1 1 160px" }}>
              Válida até
              <input className="input" type="date" name="valida_ate" required min="2000-01-01" max="2100-12-31" />
            </label>
            <SubmitButton className="btn">
              <Icon name="plus" size={15} /> Outra certidão
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

export default function Page(props: PageProps<"/certidoes">) {
  return (
    <Suspense fallback={<Loading label="Carregando certidões…" />}>
      <Certidoes {...props} />
    </Suspense>
  );
}
