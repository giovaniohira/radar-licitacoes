"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Icon, Logo } from "@/components/icons";
import { valorCurto } from "@/components/ui";
import { mascaraCnpj, normalizeCnpj } from "@/lib/cnpj";
import { formatInt, frase, nome as nomeOrgao, prazo, tituloCurto } from "@/lib/format";
import { FAIXAS, SETORES, UFS } from "@/lib/setores";
import { concluirOnboarding, previewAlerta, pularOnboarding, type Preview } from "../actions/alertas";
import { confirmarEmpresa, consultarEmpresa, type Empresa } from "../actions/auth";

const PASSOS = ["Sua empresa", "Seu alerta"];
const exemplo = (palavras: string) => palavras.split(",").slice(0, 2).join(",");
const Seta = () => <Icon name="arrowRight" size={15} className="arr" />;

/** Keywords as a comma list without repeats (case- and accent-insensitive). */
function juntar(...listas: string[][]): string {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const p of listas.flat().map((s) => s.trim()).filter(Boolean)) {
    const k = p.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(p);
  }
  return saida.join(", ");
}

/**
 * Two steps (docs/empresa/spec-contas.md, "Decisão do Product"): 1) the CNPJ, confirmed against the Receita's public
 * record; 2) the alert, pre-filled from that record and from the company's PNCP contracts, with the editais to pick
 * in the live preview. The CNPJ is required; "Pular por agora" only skips the alert.
 */
export function Onboarding({ email, cnpj: cnpjSalvo }: { email: string; cnpj: string }) {
  const [passo, setPasso] = useState(0);

  // Step 1
  const [cnpj, setCnpj] = useState(cnpjSalvo);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [erroCampo, setErroCampo] = useState("");
  const [erro, setErro] = useState("");
  const [consultando, consultar] = useTransition();
  const [salvando, salvar] = useTransition();
  const campoCnpj = useRef<HTMLInputElement>(null);

  // Step 2
  const [setores, setSetores] = useState<string[]>([]);
  const [palavras, setPalavras] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const [faixa, setFaixa] = useState(0);
  const [sugestao, setSugestao] = useState<{ setores: string[]; ufs: string[]; historico: number; razao: string | null }>({
    setores: [],
    ufs: [],
    historico: 0,
    razao: null,
  });
  const [ultima, setPreview] = useState<Preview>(null);
  const preview = palavras.trim() ? ultima : null;
  const [contando, contar] = useTransition();
  const [state, action, pending] = useActionState(concluirOnboarding, null);
  const form = useRef<HTMLFormElement>(null);

  function digitar(valor: string) {
    const m = mascaraCnpj(valor);
    setCnpj(m);
    setEmpresa(null);
    setErro("");
    setErroCampo("");
    const bruto = m.replace(/\W/g, "");
    if (bruto.length < 14) return;
    if (!normalizeCnpj(bruto)) return setErroCampo("Este CNPJ não existe. Confira os números.");
    consultar(async () => {
      const r = await consultarEmpresa(bruto);
      if (!r) return setErro("Não deu para consultar agora. Tente de novo.");
      if ("error" in r) return r.campo ? setErroCampo(r.error) : setErro(r.error);
      setEmpresa(r.empresa);
    });
  }

  // A CNPJ already on the account (a reload mid-onboarding) is looked up again to rebuild the suggestions.
  const consultouSalvo = useRef(false);
  useEffect(() => {
    if (!cnpjSalvo || consultouSalvo.current) return;
    consultouSalvo.current = true;
    digitar(cnpjSalvo);
  });

  function naoEEsta() {
    setCnpj("");
    setEmpresa(null);
    campoCnpj.current?.focus();
  }

  function escolherSetores(ids: string[]) {
    const escolhidos = SETORES.filter((s) => ids.includes(s.id));
    setSetores(ids);
    setPalavras(escolhidos.map((s) => s.palavras).join(", "));
  }

  function toggleSetor(id: string) {
    escolherSetores(setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id]);
  }

  /** "Sim, é esta empresa" (or "Continuar" when the lookup failed): saves the CNPJ, fills step 2. */
  function seguir() {
    if (!empresa) return;
    setErro("");
    salvar(async () => {
      const r = await confirmarEmpresa(empresa.cnpj);
      if (r.error) return setErro(r.error);
      // Fill only once: going back to step 1 and on again keeps what the user already changed.
      if (!palavras.trim() && !ufs.length) {
        const ids = empresa.setores.slice(0, 3);
        const base = SETORES.filter((s) => ids.includes(s.id)).map((s) => s.palavras.split(","));
        const sugeridas = [empresa.uf, ...empresa.ufsContratos].filter((u): u is string => !!u);
        setSetores(ids);
        setPalavras(juntar(...base, empresa.palavras));
        setUfs([...new Set(sugeridas)]);
        setSugestao({ setores: ids, ufs: sugeridas, historico: empresa.palavras.length, razao: empresa.razaoSocial ? nomeOrgao(empresa.razaoSocial) : null });
      }
      ir(1);
    });
  }

  // Live count of open editais for the answers so far.
  useEffect(() => {
    if (!palavras.trim() || passo !== 1) return;
    const t = setTimeout(() => contar(async () => setPreview(await previewAlerta(null, new FormData(form.current!)))), 400);
    return () => clearTimeout(t);
  }, [palavras, ufs, faixa, passo]);

  function ir(n: number) {
    setPasso(n);
    window.scrollTo({ top: 0 });
  }

  const nomeAlerta = SETORES.filter((s) => setores.includes(s.id))
    .map((s) => s.nome)
    .join(" e ")
    .slice(0, 80);
  // Suggested sectors first: on a phone the list is one column, and the pick should be in view.
  const ordenados = [...SETORES].sort((a, b) => Number(sugestao.setores.includes(b.id)) - Number(sugestao.setores.includes(a.id)));
  const bruto = cnpj.replace(/\W/g, "");
  const status = consultando ? "busy" : empresa && !empresa.semCadastro ? "ok" : "";

  return (
    <main id="conteudo" className="onb">
      <header className="onb-top">
        <div>
          <Logo />
          <ol className="stepper" aria-label="Etapas">
            {PASSOS.map((p, i) => (
              <li key={p} aria-current={i === passo ? "step" : undefined} className={i < passo ? "feito" : i === passo ? "atual" : undefined}>
                <i />
                <span>{p}</span>
              </li>
            ))}
          </ol>
          {passo === 1 ? (
            <form action={pularOnboarding}>
              <button className="btn btn-ghost">Pular por agora</button>
            </form>
          ) : (
            <span className="xs subtle" style={{ fontFamily: "var(--mono)", letterSpacing: ".06em", textTransform: "uppercase" }}>
              {email}
            </span>
          )}
        </div>
      </header>

      {passo === 0 ? (
        <div className="onb-main">
          <div className="onb-form">
            <section className="onb-step">
              <div>
                <p className="k">Passo 1 de 2</p>
                <h1>Qual o CNPJ da sua empresa?</h1>
                <p>Com ele, o Vencedital já sabe o seu ramo e os estados onde você vende. Você confere antes de salvar.</p>
              </div>
              <label className="field" style={{ fontSize: 13, fontWeight: 550 }}>
                CNPJ
                <span className="cnpj">
                  <input
                    ref={campoCnpj}
                    className="input"
                    value={cnpj}
                    onChange={(e) => digitar(e.target.value)}
                    inputMode={/[A-Z]/.test(bruto) ? "text" : "numeric"}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="00.000.000/0000-00"
                    autoFocus
                    aria-invalid={erroCampo ? true : undefined}
                    aria-describedby="cnpj-ajuda"
                  />
                  <span className={`st ${status === "busy" ? "busy" : ""}`} aria-hidden="true">
                    {status === "ok" && <Icon name="check" size={18} />}
                  </span>
                </span>
                {erroCampo ? (
                  <span className="erro" id="cnpj-ajuda">
                    {erroCampo}
                  </span>
                ) : (
                  <span className="hint" id="cnpj-ajuda">
                    Pode colar com ou sem pontos.
                  </span>
                )}
              </label>

              <div aria-live="polite" className="stack" style={{ gap: 16 }}>
                {consultando && <p className="aguardando">Consultando o cadastro da Receita</p>}
                {erro && (
                  <div className="notice" role="alert">
                    {erro}
                  </div>
                )}
                {empresa &&
                  !consultando &&
                  !erro &&
                  (empresa.semCadastro ? (
                    <SemCadastro seguir={seguir} salvando={salvando} />
                  ) : (
                    <CartaoEmpresa empresa={empresa} seguir={seguir} naoEEsta={naoEEsta} salvando={salvando} />
                  ))}
              </div>
            </section>
          </div>
          <aside className="previa">
            <div className="h">
              <div className="xs">Por que o CNPJ</div>
              <b>Um teste grátis por empresa</b>
              <p>E você passa a entrar com o CNPJ e a senha.</p>
            </div>
            <div className="e">
              <b>Usamos só dados públicos</b>
              <small>Razão social, cidade, UF e atividade, do cadastro da Receita e do PNCP.</small>
            </div>
            <div className="f">Não pedimos sócios nem documentos.</div>
          </aside>
        </div>
      ) : (
        <div className="onb-main">
          <form id="onb" ref={form} action={action} className="onb-form">
            <section className="onb-step">
              <div>
                <p className="k">Passo 2 de 2</p>
                <h1>Confira seu alerta</h1>
                <p>
                  {sugestao.razao ? `Preenchemos pelo CNPJ da ${sugestao.razao}. ` : ""}Mude o que quiser; dá para ajustar depois em Alertas.
                </p>
              </div>

              <div className="bloco">
                <header>
                  <h2>O que você vende</h2>
                  <p>Os setores viram as palavras que buscamos no PNCP.</p>
                </header>
                <div className="onb-cards compacto">
                  {ordenados.map((s) => (
                    <button key={s.id} type="button" className="onb-card" aria-pressed={setores.includes(s.id)} onClick={() => toggleSetor(s.id)}>
                      <span className="box">
                        <Icon name="check" size={13} strokeWidth={3} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <b>{s.nome}</b>
                        <small>{exemplo(s.palavras)}</small>
                        {sugestao.setores.includes(s.id) && <span className="sug">Pelo seu CNPJ</span>}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="field" style={{ fontSize: 13, fontWeight: 550 }}>
                  <span className="field-top">
                    <label htmlFor="onb-palavras">Palavras-chave</label>
                    {sugestao.historico > 0 && <span className="sug">{sugestao.historico} do seu histórico</span>}
                  </span>
                  <input
                    id="onb-palavras"
                    className="input input-lg"
                    name="palavras"
                    value={palavras}
                    onChange={(e) => setPalavras(e.target.value)}
                    placeholder="ex.: notebook, computador portátil, impressora -locação"
                  />
                  <span className="hint">Vírgula separa alternativas. Hífen na frente exclui a palavra.</span>
                </div>
                <input type="hidden" name="nome" value={nomeAlerta} />
              </div>

              <div className="bloco">
                <header>
                  <h2>Estados</h2>
                  <p>{sugestao.ufs.length ? <span className="sug">Sede e onde você já tem contrato</span> : "Nenhum marcado = Brasil inteiro."}</p>
                </header>
                <div className="uf-chips" style={{ gap: 6 }}>
                  {UFS.map((u) => (
                    <label key={u}>
                      <input
                        type="checkbox"
                        name="uf"
                        value={u}
                        className={sugestao.ufs.includes(u) ? "sug-uf" : undefined}
                        checked={ufs.includes(u)}
                        onChange={(e) => setUfs((xs) => (e.target.checked ? [...xs, u] : xs.filter((x) => x !== u)))}
                      />
                      <span style={{ minWidth: 48, padding: "7px 10px", fontSize: 13 }}>{u}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bloco">
                <header>
                  <h2>Tamanho do contrato</h2>
                  <p>Pelo valor estimado do edital.</p>
                </header>
                <div className="seg faixas" role="radiogroup" aria-label="Tamanho do contrato">
                  {FAIXAS.map((f, i) => (
                    <label key={f.nome} title={f.desc}>
                      <input type="radio" name="faixa" checked={faixa === i} onChange={() => setFaixa(i)} />
                      <span>{f.nome}</span>
                    </label>
                  ))}
                </div>
                <input type="hidden" name="min" value={FAIXAS[faixa].min} />
                <input type="hidden" name="max" value={FAIXAS[faixa].max} />
              </div>

              {state?.error && (
                <div className="notice" role="alert">
                  {state.error}
                </div>
              )}
              <div className="onb-nav">
                <button type="button" className="btn" onClick={() => ir(0)}>
                  Voltar
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending || !palavras.trim()}>
                  {pending ? "Salvando…" : "Salvar alerta e abrir o Hoje"} <Seta />
                </button>
              </div>
            </section>
          </form>

          <aside aria-label="Prévia" className="previa" aria-live="polite">
            <div className="h">
              <div className="xs">Prévia ao vivo</div>
              <b>
                {!palavras.trim()
                  ? "Escolha um setor para começar"
                  : contando && !preview
                    ? "Contando…"
                    : `${formatInt(preview?.total ?? 0)} ${preview?.total === 1 ? "edital aberto combina" : "editais abertos combinam"}`}
              </b>
              <p>{preview?.total ? "Marque os que valem uma olhada: eles entram em Minhas disputas." : "O número muda conforme você ajusta."}</p>
            </div>
            {preview?.exemplos.slice(0, 4).map((e) => (
              <label key={e.id} className="e pick">
                {/* Outside the <form> in the markup, tied to it by id. */}
                <input type="checkbox" name="acompanhar" value={e.id} form="onb" />
                <span>
                  <b>{tituloCurto(frase(e.objeto))}</b>
                  <small>
                    {nomeOrgao(e.orgao)} · {e.uf}
                  </small>
                </span>
                <span className="v">
                  <b>{valorCurto(e.valor_estimado)}</b>
                  {e.encerramento ? prazo(e.encerramento) : "sem prazo"}
                </span>
              </label>
            ))}
            {preview && preview.total === 0 && (
              <div className="e">
                <small>Nenhum edital aberto bate agora. Tente mais palavras ou mais estados, ou salve assim: o alerta avisa quando aparecer.</small>
              </div>
            )}
            <div className="f">Todo dia às 7h, os novos chegam em {email}.</div>
          </aside>
        </div>
      )}
    </main>
  );
}

function CartaoEmpresa({ empresa, seguir, naoEEsta, salvando }: { empresa: Empresa; seguir: () => void; naoEEsta: () => void; salvando: boolean }) {
  const setores = SETORES.filter((s) => empresa.setores.slice(0, 3).includes(s.id)).map((s) => s.nome);
  const lugar = [empresa.municipio && nomeOrgao(empresa.municipio), empresa.uf].filter(Boolean).join("-");
  const n = empresa.ufsContratos.length;
  const contratos = n ? `${empresa.uf ? "e mais " : ""}${n} ${n === 1 ? "estado" : "estados"} onde você já tem contrato` : "";
  const estados = [empresa.uf, contratos].filter(Boolean).join(" ");
  return (
    <div className="empresa">
      <p className="kicker">Encontramos no cadastro da Receita</p>
      <div>
        <div className="nome">{empresa.razaoSocial ? nomeOrgao(empresa.razaoSocial) : empresa.cnpj}</div>
        {(lugar || empresa.abertura) && <p className="meta">{[lugar, empresa.abertura && `aberta em ${empresa.abertura}`].filter(Boolean).join(" · ")}</p>}
      </div>
      <dl>
        {empresa.atividade && (
          <>
            <dt>Atividade</dt>
            <dd>{empresa.atividade}</dd>
          </>
        )}
        <dt>Vamos sugerir</dt>
        <dd>{[setores.length ? setores.join(", ") : "o ramo você escolhe no próximo passo", estados].filter(Boolean).join(" · ")}</dd>
      </dl>
      <div className="acts">
        <button className="btn btn-primary btn-lg" type="button" onClick={seguir} disabled={salvando} autoFocus>
          {salvando ? "Salvando…" : "Sim, é esta empresa"} <Seta />
        </button>
        <button className="btn btn-ghost btn-lg" type="button" onClick={naoEEsta} disabled={salvando}>
          Não é esta
        </button>
      </div>
    </div>
  );
}

function SemCadastro({ seguir, salvando }: { seguir: () => void; salvando: boolean }) {
  return (
    <>
      <div className="notice info">Não conseguimos consultar o cadastro agora. Siga em frente: você escolhe o ramo no próximo passo.</div>
      <div className="onb-nav" style={{ border: 0, padding: 0 }}>
        <span />
        <button className="btn btn-primary" type="button" onClick={seguir} disabled={salvando}>
          {salvando ? "Salvando…" : "Continuar"} <Seta />
        </button>
      </div>
    </>
  );
}
