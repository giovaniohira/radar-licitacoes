"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { formatBRLCompact, formatInt } from "@/lib/format";
import { FAIXAS, SETORES, UFS } from "@/lib/setores";
import { atualizarAlerta, criarAlerta, previewAlerta } from "../../actions/alertas";

export interface AlertaEditavel {
  id: number;
  nome: string;
  palavras: string;
  ufs: string[];
  modalidades: number[];
  valor_min: string | null;
  valor_max: string | null;
}

const num = (v: string | null) => (v == null ? "" : String(Number(v)));

/** Four quick questions; the matching count updates as the answers change. Also edits an existing alert. */
export function NovoAlerta({ editar }: { editar?: AlertaEditavel }) {
  const [state, action, pending] = useActionState(editar ? atualizarAlerta : criarAlerta, null);
  const [setores, setSetores] = useState<string[]>([]);
  const [palavras, setPalavras] = useState(editar?.palavras ?? "");
  const [nome, setNome] = useState(editar?.nome ?? "");
  const [ufs, setUfs] = useState<string[]>(editar?.ufs ?? []);
  const atual = editar ? FAIXAS.findIndex((f) => f.min === num(editar.valor_min) && f.max === num(editar.valor_max)) : 0;
  // An edited alert with a custom range keeps it as an extra option.
  const faixas = editar && atual < 0 ? [...FAIXAS, { nome: "Faixa atual", desc: `${formatBRLCompact(editar.valor_min)} a ${formatBRLCompact(editar.valor_max)}`, min: num(editar.valor_min), max: num(editar.valor_max) }] : FAIXAS;
  const [faixa, setFaixa] = useState(atual < 0 ? FAIXAS.length : atual);
  const [contagem, setTotal] = useState<number | null>(null);
  const total = palavras.trim() ? contagem : null;
  const [, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function toggleSetor(id: string) {
    const ids = setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id];
    const escolhidos = SETORES.filter((s) => ids.includes(s.id));
    setSetores(ids);
    setPalavras(escolhidos.map((s) => s.palavras).join(", "));
    setNome(escolhidos.map((s) => s.nome).join(" e ").slice(0, 80));
  }

  // Debounced count of open editais for the current answers.
  useEffect(() => {
    if (!palavras.trim()) return;
    const t = setTimeout(() => start(async () => setTotal((await previewAlerta(null, new FormData(form.current!)))?.total ?? 0)), 400);
    return () => clearTimeout(t);
  }, [palavras, ufs, faixa]);

  return (
    <form ref={form} action={action} id="novo" className="card novo-alerta" aria-label={editar ? "Editar alerta" : "Novo alerta"}>
      <div>
        <h2>{editar ? `Editar “${editar.nome}”` : "Novo alerta"}</h2>
        <p className="small subtle" style={{ marginTop: 2 }}>
          4 perguntas rápidas. Dá para mudar tudo depois.
        </p>
      </div>
      {editar && <input type="hidden" name="id" value={editar.id} />}
      <input type="hidden" name="nome" value={nome} />
      {editar?.modalidades.map((m) => <input key={m} type="hidden" name="modalidade" value={m} />)}

      <div className="field">
        1. O que você vende?
        <div className="row" style={{ gap: 6 }}>
          {SETORES.map((s) => (
            <button key={s.id} type="button" className="chip-link" aria-pressed={setores.includes(s.id)} onClick={() => toggleSetor(s.id)}>
              {s.nome}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        2. Palavras-chave
        <input className="input" name="palavras" required value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="ex.: limpeza predial, conservação, -dedetização" />
        <span className="hint">Vírgula separa alternativas. Hífen exclui.</span>
      </label>
      <div className="field">
        3. Em quais estados?
        <details className="dd">
          <summary>
            <span>{ufs.length ? ufs.join(", ") : "Brasil inteiro"}</span>
          </summary>
          <div className="menu-pop">
            <div className="uf-chips">
              {UFS.map((u) => (
                <label key={u}>
                  <input
                    type="checkbox"
                    name="uf"
                    value={u}
                    checked={ufs.includes(u)}
                    onChange={(e) => setUfs((xs) => (e.target.checked ? [...xs, u] : xs.filter((x) => x !== u)))}
                  />
                  <span>{u}</span>
                </label>
              ))}
            </div>
          </div>
        </details>
      </div>
      <div className="field">
        4. Tamanho do contrato
        <div className="opts">
          {faixas.map((f, i) => (
            <label key={f.nome} className="opt">
              <input type="radio" name="faixa" checked={faixa === i} onChange={() => setFaixa(i)} />
              <b>{f.nome}</b>
              <small>{f.desc}</small>
            </label>
          ))}
        </div>
        <input type="hidden" name="min" value={faixas[faixa]?.min ?? ""} />
        <input type="hidden" name="max" value={faixas[faixa]?.max ?? ""} />
      </div>

      {total != null && (
        <div className="contagem" role="status">
          <Icon name="check" size={16} strokeWidth={2.2} />
          <span>
            <strong className="num">
              {formatInt(total)} {total === 1 ? "edital aberto" : "editais abertos"}
            </strong>{" "}
            {total === 1 ? "combina" : "combinam"} com esse alerta hoje.
          </span>
        </div>
      )}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      {state?.error && <div className="notice">{state.error}</div>}
      <button type="submit" className="btn btn-primary" style={{ height: 40, fontSize: 14 }} disabled={pending}>
        {pending ? "Salvando…" : editar ? "Salvar alterações" : "Criar alerta"}
      </button>
      {editar && (
        <Link href="/alertas" className="small" style={{ textAlign: "center" }}>
          Cancelar
        </Link>
      )}
    </form>
  );
}
