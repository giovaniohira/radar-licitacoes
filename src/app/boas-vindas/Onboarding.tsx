"use client";

import { useActionState, useRef, useState } from "react";
import { Icon, Logo } from "@/components/icons";
import { formatBRL, formatInt, frase, local, nome as nomeOrgao, prazo, tituloCurto } from "@/lib/format";
import { SETORES, UFS } from "@/lib/setores";
import { concluirOnboarding, previewAlerta, pularOnboarding, type Preview } from "../actions/alertas";

const PASSOS = ["O que você vende", "Onde", "Valor", "Seu alerta"];

// R$ 80 mil is the Lei Complementar 123 ceiling for items reserved to ME/EPP.
const FAIXAS = [
  { nome: "Qualquer valor", desc: "Da compra direta ao contrato milionário", min: "", max: "" },
  { nome: "Até R$ 80 mil", desc: "Faixa com disputa exclusiva para ME e EPP", min: "", max: "80000" },
  { nome: "Até R$ 1 milhão", desc: "Pequenas e médias contratações", min: "", max: "1000000" },
  { nome: "Acima de R$ 1 milhão", desc: "Grandes contratos", min: "1000000", max: "" },
];

export function Onboarding({ email }: { email: string }) {
  const [passo, setPasso] = useState(0);
  const [setores, setSetores] = useState<string[]>([]);
  const [palavras, setPalavras] = useState("");
  const [nome, setNome] = useState("");
  const [faixa, setFaixa] = useState(0);
  const [preview, setPreview] = useState<Preview>(null);
  const [state, action, pending] = useActionState(concluirOnboarding, null);
  const form = useRef<HTMLFormElement>(null);

  // Sectors are a starting point: picking one rewrites the keywords and the alert name, which stay editable.
  function toggleSetor(id: string) {
    const ids = setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id];
    const escolhidos = SETORES.filter((s) => ids.includes(s.id));
    setSetores(ids);
    setPalavras(escolhidos.map((s) => s.palavras).join(", "));
    setNome(escolhidos.map((s) => s.nome).join(" e ").slice(0, 80));
  }

  async function ir(n: number) {
    setPasso(n);
    window.scrollTo({ top: 0 });
    if (n === 3) {
      setPreview(null);
      setPreview(await previewAlerta(null, new FormData(form.current!)));
    }
  }

  return (
    <main id="conteudo" className="onb">
      <header className="onb-top">
        <Logo />
        <ol className="onb-passos" aria-label="Etapas">
          {PASSOS.map((p, i) => (
            <li key={p} aria-current={i === passo ? "step" : undefined} className={i < passo ? "feito" : undefined}>
              <span className="n">{i < passo ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="l">{p}</span>
            </li>
          ))}
        </ol>
        <form action={pularOnboarding}>
          <button className="btn btn-ghost btn-sm">Pular por agora</button>
        </form>
      </header>

      <form ref={form} action={action} className="onb-corpo">
        <section hidden={passo !== 0} className="stack-lg">
          <div className="onb-head">
            <p className="overline">Passo 1 de 4</p>
            <h1>O que sua empresa vende para o governo?</h1>
            <p>Escolha um ou mais setores. Eles viram as palavras-chave que o Radar procura todo dia no PNCP.</p>
          </div>
          <div className="onb-opcoes">
            {SETORES.map((s) => (
              <button key={s.id} type="button" className="onb-opcao" aria-pressed={setores.includes(s.id)} onClick={() => toggleSetor(s.id)}>
                <b>{s.nome}</b>
                <small>CNAE {s.cnae}</small>
              </button>
            ))}
          </div>
          <label className="field">
            <span>Palavras-chave · vírgula separa alternativas, -palavra exclui</span>
            <textarea
              className="input"
              name="palavras"
              rows={3}
              value={palavras}
              onChange={(e) => setPalavras(e.target.value)}
              placeholder="ex.: notebook, computador portátil, impressora -locação"
            />
          </label>
        </section>

        <section hidden={passo !== 1} className="stack-lg">
          <div className="onb-head">
            <p className="overline">Passo 2 de 4</p>
            <h1>Em quais estados você quer vender?</h1>
            <p>Deixe tudo desmarcado para receber editais do Brasil inteiro.</p>
          </div>
          <div className="chips onb-ufs">
            {UFS.map((u) => (
              <label key={u} className="chip">
                <input type="checkbox" name="uf" value={u} />
                <span>{u}</span>
              </label>
            ))}
          </div>
        </section>

        <section hidden={passo !== 2} className="stack-lg">
          <div className="onb-head">
            <p className="overline">Passo 3 de 4</p>
            <h1>Qual tamanho de contrato faz sentido?</h1>
            <p>Pelo valor estimado do edital. Dá para mudar depois em Alertas.</p>
          </div>
          <div className="onb-opcoes">
            {FAIXAS.map((f, i) => (
              <label key={f.nome} className="onb-opcao">
                <input type="radio" name="faixa" className="sr-only" checked={faixa === i} onChange={() => setFaixa(i)} />
                <b>{f.nome}</b>
                <small>{f.desc}</small>
              </label>
            ))}
          </div>
          <input type="hidden" name="min" value={FAIXAS[faixa].min} />
          <input type="hidden" name="max" value={FAIXAS[faixa].max} />
        </section>

        <section hidden={passo !== 3} className="stack-lg">
          <div className="onb-head">
            <p className="overline">Passo 4 de 4</p>
            <h1>Seu primeiro alerta</h1>
            <p>
              Todo dia às 7h, um e-mail para <b>{email}</b> só com os editais que você ainda não recebeu.
            </p>
          </div>
          <label className="field">
            <span>Nome do alerta</span>
            <input className="input input-lg" name="nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Informática no Sul" />
          </label>

          {!preview ? (
            <div className="card onb-previa muted" role="status" aria-busy="true">
              Contando os editais que combinam com este alerta…
            </div>
          ) : preview.total === 0 ? (
            <div className="notice">
              Nenhum edital aberto bate com esses filtros agora. Volte e tente mais palavras, mais estados ou outra faixa de valor, ou crie assim mesmo: o
              alerta avisa quando aparecer um.
            </div>
          ) : (
            <div className="card onb-previa">
              <div>
                <h2>
                  {formatInt(preview.total)} {preview.total === 1 ? "edital aberto combina" : "editais abertos combinam"} com este alerta agora
                </h2>
                <p className="small subtle">Marque os que valem uma olhada: eles entram no seu pipeline, na coluna Triagem.</p>
              </div>
              {preview.exemplos.map((e) => (
                <label key={e.id} className="onb-edital">
                  <input type="checkbox" name="acompanhar" value={e.id} />
                  <span>
                    <span className="t">{tituloCurto(frase(e.objeto))}</span>
                    <span className="m">
                      {nomeOrgao(e.orgao)} · {local(e.municipio, e.uf, e.orgao)}
                    </span>
                  </span>
                  <span className="v">
                    <b>{formatBRL(e.valor_estimado)}</b>
                    <small>{e.encerramento ? prazo(e.encerramento) : "Sem prazo"}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {state?.error && <div className="notice danger">{state.error}</div>}
        </section>

        <div className="onb-nav">
          {passo > 0 && (
            <button type="button" className="btn btn-lg btn-ghost" onClick={() => ir(passo - 1)}>
              Voltar
            </button>
          )}
          {passo < 3 ? (
            <button type="button" className="btn btn-lg btn-primary" disabled={passo === 0 && !palavras.trim()} onClick={() => ir(passo + 1)}>
              Continuar
            </button>
          ) : (
            <button type="submit" className="btn btn-lg btn-primary" disabled={pending || !preview}>
              <Icon name="bell" size={15} /> {pending ? "Criando…" : "Criar alerta e abrir o painel"}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
