"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Icon, Logo } from "@/components/icons";
import { valorCurto } from "@/components/ui";
import { formatInt, frase, nome as nomeOrgao, prazo, tituloCurto } from "@/lib/format";
import { FAIXAS, SETORES, UFS } from "@/lib/setores";
import { concluirOnboarding, previewAlerta, pularOnboarding, type Preview } from "../actions/alertas";
import { cnpjOnboarding } from "../actions/auth";

const PASSOS = ["Sua empresa", "O que você vende", "Estados", "Tamanho do contrato", "Seu alerta"];
const exemplo = (palavras: string) => palavras.split(",").slice(0, 3).join(",");

export function Onboarding({ email, cnpj: cnpjSalvo }: { email: string; cnpj: string }) {
  const [passo, setPasso] = useState(0);
  const [cnpj, setCnpj] = useState(cnpjSalvo);
  const [empresa, setEmpresa] = useState<{ razao?: string; uf?: string | null; achou: boolean } | null>(null);
  const [erroCnpj, setErroCnpj] = useState("");
  const [buscando, buscar] = useTransition();
  const [setores, setSetores] = useState<string[]>([]);
  const [palavras, setPalavras] = useState("");
  const [nome, setNome] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const [faixa, setFaixa] = useState(0);
  const [ultima, setPreview] = useState<Preview>(null);
  const preview = palavras.trim() ? ultima : null;
  const [contando, start] = useTransition();
  const [state, action, pending] = useActionState(concluirOnboarding, null);
  const form = useRef<HTMLFormElement>(null);

  // Sectors are a starting point: picking one rewrites the keywords and the alert name, which stay editable.
  function toggleSetor(id: string) {
    escolherSetores(setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id]);
  }

  function escolherSetores(ids: string[]) {
    const escolhidos = SETORES.filter((s) => ids.includes(s.id));
    setSetores(ids);
    setPalavras(escolhidos.map((s) => s.palavras).join(", "));
    setNome(escolhidos.map((s) => s.nome).join(" e ").slice(0, 80));
  }

  // Step 1: save the CNPJ, then pre-select sectors and the state from its public data. Everything stays editable.
  function salvarCnpj() {
    setErroCnpj("");
    buscar(async () => {
      const r = await cnpjOnboarding(cnpj);
      if (!r || r.error) return setErroCnpj(r?.error ?? "Não deu para salvar. Tente de novo.");
      if (r.setores?.length && !palavras.trim()) escolherSetores(r.setores.slice(0, 2));
      if (r.uf && !ufs.length) setUfs([r.uf]);
      setEmpresa({ razao: r.razaoSocial, uf: r.uf, achou: !!r.setores?.length });
      ir(1);
    });
  }

  // Live count of open editais for the answers so far.
  useEffect(() => {
    if (!palavras.trim()) return;
    const t = setTimeout(() => start(async () => setPreview(await previewAlerta(null, new FormData(form.current!)))), 400);
    return () => clearTimeout(t);
  }, [palavras, ufs, faixa]);

  function ir(n: number) {
    setPasso(n);
    window.scrollTo({ top: 0 });
  }

  return (
    <main id="conteudo" className="onb">
      <header className="onb-top">
        <div>
          <Logo />
          <ol className="stepper" aria-label="Etapas">
            {PASSOS.map((p, i) => (
              <li key={p} aria-current={i === passo ? "step" : undefined} className={i <= passo ? "feito" : undefined}>
                <i />
                <span style={i === passo ? { color: "var(--brand-text)" } : undefined}>{p}</span>
              </li>
            ))}
          </ol>
          <form action={pularOnboarding}>
            <button className="btn btn-ghost">Pular por agora</button>
          </form>
        </div>
      </header>

      <div className="onb-main">
        <form ref={form} action={action} className="onb-form">
          <section hidden={passo !== 0} className="onb-step">
            <div>
              <p className="k">Passo 1 de 5</p>
              <h1>Qual é o CNPJ da sua empresa?</h1>
              <p>Com ele já marcamos o seu ramo e o seu estado nos próximos passos. E você passa a poder entrar com o CNPJ no lugar do e-mail.</p>
            </div>
            <label className="field" style={{ fontSize: 13, fontWeight: 550 }}>
              CNPJ
              <input
                className="input input-lg"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (cnpj.trim()) salvarCnpj();
                  }
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="00.000.000/0000-00"
                autoFocus
              />
            </label>
            {erroCnpj && <div className="notice">{erroCnpj}</div>}
          </section>

          <section hidden={passo !== 1} className="onb-step">
            <div>
              <p className="k">Passo 2 de 5</p>
              {empresa?.razao && (
                <p className="small muted">
                  {empresa.razao}
                  {empresa.achou ? ": já marcamos o ramo pelo CNAE da empresa. Ajuste se precisar." : ""}
                </p>
              )}
              <h1>O que sua empresa vende para o governo?</h1>
              <p>Escolha um ou mais setores. Eles viram as palavras-chave que o Vencedital procura todo dia no PNCP.</p>
            </div>
            <div className="onb-cards">
              {SETORES.map((s) => (
                <button key={s.id} type="button" className="onb-card" aria-pressed={setores.includes(s.id)} onClick={() => toggleSetor(s.id)}>
                  <span className="box">
                    <Icon name="check" size={13} strokeWidth={3} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b>{s.nome}</b>
                    <small>{exemplo(s.palavras)}</small>
                  </span>
                </button>
              ))}
            </div>
            <label className="field" style={{ fontSize: 13, fontWeight: 550 }}>
              Palavras-chave
              <input className="input input-lg" name="palavras" value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="ex.: notebook, computador portátil, impressora -locação" />
              <span className="hint">Vírgula separa alternativas. Hífen na frente exclui a palavra.</span>
            </label>
          </section>

          <section hidden={passo !== 2} className="onb-step">
            <div>
              <p className="k">Passo 3 de 5</p>
              <h1>Em quais estados você quer vender?</h1>
              <p>
                {empresa?.uf ? `Já marcamos ${empresa.uf}, onde fica sua empresa. ` : ""}Deixe tudo desmarcado para receber editais do Brasil inteiro.
              </p>
            </div>
            <div className="uf-chips" style={{ gap: 6 }}>
              {UFS.map((u) => (
                <label key={u}>
                  <input
                    type="checkbox"
                    name="uf"
                    value={u}
                    checked={ufs.includes(u)}
                    onChange={(e) => setUfs((xs) => (e.target.checked ? [...xs, u] : xs.filter((x) => x !== u)))}
                  />
                  <span style={{ minWidth: 52, padding: "7px 12px", fontSize: 13 }}>{u}</span>
                </label>
              ))}
            </div>
          </section>

          <section hidden={passo !== 3} className="onb-step">
            <div>
              <p className="k">Passo 4 de 5</p>
              <h1>Qual tamanho de contrato faz sentido?</h1>
              <p>Pelo valor estimado do edital. Dá para mudar depois em Alertas.</p>
            </div>
            <div className="onb-cards">
              {FAIXAS.map((f, i) => (
                <label key={f.nome} className="onb-card">
                  <input type="radio" name="faixa" checked={faixa === i} onChange={() => setFaixa(i)} />
                  <span className="box" style={{ borderRadius: "50%" }}>
                    <Icon name="check" size={13} strokeWidth={3} />
                  </span>
                  <span>
                    <b>{f.nome}</b>
                    <small>{f.desc}</small>
                  </span>
                </label>
              ))}
            </div>
            <input type="hidden" name="min" value={FAIXAS[faixa].min} />
            <input type="hidden" name="max" value={FAIXAS[faixa].max} />
          </section>

          <section hidden={passo !== 4} className="onb-step">
            <div>
              <p className="k">Passo 5 de 5</p>
              <h1>Seu primeiro alerta</h1>
              <p>
                Todo dia às 7h, se houver edital novo, mandamos um e-mail para <b>{email}</b>. Só com o que você ainda não recebeu.
              </p>
            </div>
            <label className="field" style={{ fontSize: 13, fontWeight: 550 }}>
              Nome do alerta
              <input className="input input-lg" name="nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Informática no Sul" />
            </label>
            {preview && preview.total > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small muted">Marque os que valem uma olhada: eles entram em Minhas disputas, na etapa Triagem.</p>
                <div className="escolha">
                  {preview.exemplos.map((e) => (
                    <label key={e.id}>
                      <input type="checkbox" name="acompanhar" value={e.id} />
                      <span>
                        <b>{tituloCurto(frase(e.objeto))}</b>
                        <small>
                          {nomeOrgao(e.orgao)} · {e.uf}
                        </small>
                      </span>
                      <span className="v">
                        <b>{valorCurto(e.valor_estimado)}</b>
                        <small>{e.encerramento ? prazo(e.encerramento) : "sem prazo"}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              preview && (
                <div className="notice info">
                  Nenhum edital aberto bate com esses filtros agora. Volte e tente mais palavras, mais estados ou outra faixa de valor, ou crie assim mesmo: o alerta avisa
                  quando aparecer um.
                </div>
              )
            )}
            {state?.error && <div className="notice">{state.error}</div>}
          </section>

          <div className="onb-nav">
            <button type="button" className="btn" disabled={passo === 0} onClick={() => ir(passo - 1)}>
              Voltar
            </button>
            {passo === 0 ? (
              <button type="button" className="btn btn-primary" disabled={buscando || !cnpj.trim()} onClick={salvarCnpj}>
                {buscando ? "Buscando…" : "Continuar"}
              </button>
            ) : passo < 4 ? (
              <button type="button" className="btn btn-primary" disabled={passo === 1 && !palavras.trim()} onClick={() => ir(passo + 1)}>
                Continuar
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={pending || !palavras.trim()}>
                {pending ? "Criando…" : "Criar alerta e abrir o Hoje"}
              </button>
            )}
          </div>
        </form>

        <aside aria-label="Prévia" className="previa" aria-live="polite">
          <div className="h">
            <div className="xs">Prévia ao vivo</div>
            <b>
              {!palavras.trim() ? "Escolha um setor para começar" : contando && !preview ? "Contando…" : `${formatInt(preview?.total ?? 0)} ${preview?.total === 1 ? "edital aberto combina" : "editais abertos combinam"}`}
            </b>
            <p>O número muda conforme você responde.</p>
          </div>
          {preview?.exemplos.slice(0, 3).map((e) => (
            <div key={e.id} className="e">
              <b>{tituloCurto(frase(e.objeto))}</b>
              <small>
                {nomeOrgao(e.orgao)} · {e.uf} · {valorCurto(e.valor_estimado)}
              </small>
            </div>
          ))}
          <div className="f">No último passo você marca os que valem uma olhada e eles entram em Minhas disputas.</div>
        </aside>
      </div>
    </main>
  );
}
