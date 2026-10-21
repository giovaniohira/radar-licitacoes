import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { AutoSelect } from "@/components/AutoSelect";
import { EditalItem, Empty, Loading, PageHead } from "@/components/ui";
import { query } from "@/lib/db";
import { formatInt } from "@/lib/format";
import { parseFiltros, withParams } from "@/lib/params";
import { MODALIDADES } from "@/lib/pncp";
import { ORDENS, buildSearch, type EditalResumo } from "@/lib/search";
import { UFS } from "@/lib/setores";
import { salvarBusca } from "../../actions/alertas";

export const metadata: Metadata = { title: "Buscar editais" };

const POR_PAGINA = 25;
const MODALIDADES_BUSCA = Object.entries(MODALIDADES).filter(([id]) => id !== "9");
const PRAZOS = [
  ["", "Qualquer prazo"],
  ["3", "Fecha em até 3 dias"],
  ["7", "Fecha em até 7 dias"],
  ["15", "Fecha em até 15 dias"],
  ["30", "Fecha em até 30 dias"],
] as const;

async function Busca({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const { sql, params } = buildSearch(f, { limit: POR_PAGINA, offset: (f.pagina - 1) * POR_PAGINA });
  const rows = await query<EditalResumo>(sql, params);
  const total = Number(rows[0]?.total ?? 0);
  const paginas = Math.ceil(total / POR_PAGINA);
  const ufs = new Set(f.ufs);
  const mods = new Set(f.modalidades?.map(String));

  const temFiltro = ufs.size > 0 || mods.size > 0 || f.valorMin != null || f.valorMax != null || !!f.prazoDias || !f.abertas;

  return (
    <div className="page busca">
      <PageHead title="Buscar editais" sub="Todas as contratações com propostas abertas no PNCP, atualizadas 3 vezes por dia." />
      <Form action="/buscar" className="stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="searchbox">
            <Icon name="search" size={20} />
            <input name="q" defaultValue={f.palavras} placeholder="O que você vende? ex.: notebook, merenda escolar, reforma" aria-label="Palavras-chave" />
            <button className="btn btn-primary">Buscar</button>
          </div>
          <p className="xs subtle">
            Dica: vírgula busca qualquer termo (<code>notebook, tablet</code>), hífen exclui (<code>-locação</code>) e aspas buscam a frase exata.
          </p>
        </div>

        <div className="filterbar" role="group" aria-label="Filtros">
          <details className="menu">
            <summary className={`chip-btn${ufs.size ? " on" : ""}`}>Estados{ufs.size ? ` (${ufs.size})` : ": todos"}</summary>
            <div className="menu-pop stack">
              <div className="chips">
                {UFS.map((u) => (
                  <label key={u} className="chip">
                    <input type="checkbox" name="uf" value={u} defaultChecked={ufs.has(u)} />
                    <span>{u}</span>
                  </label>
                ))}
              </div>
              <button className="btn btn-primary btn-sm">Aplicar</button>
            </div>
          </details>
          <details className="menu">
            <summary className={`chip-btn${mods.size ? " on" : ""}`}>Modalidade{mods.size ? ` (${mods.size})` : ": todas"}</summary>
            <div className="menu-pop stack" style={{ gap: 4 }}>
              {MODALIDADES_BUSCA.map(([id, n]) => (
                <label key={id} className="check">
                  <input type="checkbox" name="modalidade" value={id} defaultChecked={mods.has(id)} /> {n}
                </label>
              ))}
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
                Aplicar
              </button>
            </div>
          </details>
          <details className="menu">
            <summary className={`chip-btn${f.valorMin != null || f.valorMax != null ? " on" : ""}`}>Valor estimado</summary>
            <div className="menu-pop stack">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="input" name="min" inputMode="decimal" placeholder="mín. R$" aria-label="Valor mínimo" defaultValue={f.valorMin ?? ""} />
                <input className="input" name="max" inputMode="decimal" placeholder="máx. R$" aria-label="Valor máximo" defaultValue={f.valorMax ?? ""} />
              </div>
              <button className="btn btn-primary btn-sm">Aplicar</button>
            </div>
          </details>
          <AutoSelect className={`chip-btn${f.prazoDias ? " on" : ""}`} name="prazo" defaultValue={f.prazoDias ? String(f.prazoDias) : ""} aria-label="Prazo">
            {PRAZOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AutoSelect>
          <label className="check">
            <input type="checkbox" name="encerradas" value="1" defaultChecked={!f.abertas} /> Incluir encerrados
          </label>
          {temFiltro && (
            <Link className="link small" href={`/buscar${withParams({ q: f.palavras || undefined }, {})}`} style={{ marginLeft: "auto" }}>
              Limpar filtros
            </Link>
          )}
        </div>

        {f.palavras && (
          <div className="alert-cta">
            <span className="ico">
              <Icon name="bell" size={17} />
            </span>
            <p>
              <b>Não precisa buscar de novo amanhã.</b> Vire esta busca um alerta e receba só os editais novos, todo dia às 7h.
            </p>
            <button className="btn btn-primary" formAction={salvarBusca}>
              Criar alerta com esta busca
            </button>
          </div>
        )}

        <section className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <span className="small muted">
              <b className="num" style={{ color: "var(--text)", fontSize: 15 }}>
                {formatInt(total)}
              </b>{" "}
              {total === 1 ? "edital" : "editais"}
              {f.abertas && (total === 1 ? " aberto" : " abertos")}
            </span>
            <label className="row small muted" style={{ gap: 8 }}>
              Ordenar por
              <AutoSelect className="input" name="ordem" defaultValue={f.ordem ?? ""} style={{ width: "auto", height: 32 }}>
                <option value="">{f.palavras ? "Relevância" : "Prazo mais próximo"}</option>
                {Object.entries(ORDENS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </AutoSelect>
            </label>
          </div>
          {rows.length === 0 ? (
            <Empty title="Nenhum edital encontrado">Tente menos palavras, outra grafia ou remova filtros de estado e valor.</Empty>
          ) : (
            rows.map((e) => <EditalItem key={e.id} e={e} termos={f.palavras} />)
          )}
          {paginas > 1 && (
            <div className="pager">
              <span className="num">
                Página {f.pagina} de {formatInt(paginas)}
              </span>
              <div className="row">
                {f.pagina > 1 && (
                  <Link className="btn btn-sm" href={`/buscar${withParams(sp, { p: String(f.pagina - 1) })}`}>
                    Anterior
                  </Link>
                )}
                {f.pagina < paginas && (
                  <Link className="btn btn-sm" href={`/buscar${withParams(sp, { p: String(f.pagina + 1) })}`}>
                    Próxima página
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </Form>
    </div>
  );
}

export default function Buscar(props: PageProps<"/buscar">) {
  return (
    <Suspense fallback={<Loading label="Buscando editais…" />}>
      <Busca {...props} />
    </Suspense>
  );
}
