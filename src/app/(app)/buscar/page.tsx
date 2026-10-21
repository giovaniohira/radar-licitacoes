import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
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
  ["3", "Encerra em até 3 dias"],
  ["7", "Encerra em até 7 dias"],
  ["15", "Encerra em até 15 dias"],
  ["30", "Encerra em até 30 dias"],
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

  return (
    <div className="page">
      <PageHead title="Buscar editais" sub="Todas as contratações abertas no PNCP. Vírgula separa alternativas, -palavra exclui, aspas buscam a frase." />
      <Form action="/buscar" className="split">
        <aside className="card filters">
          <label className="field">
            <span>Ordenar por</span>
            <select className="input" name="ordem" defaultValue={f.ordem ?? ""}>
              <option value="">Automático</option>
              {Object.entries(ORDENS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Prazo</span>
            <select className="input" name="prazo" defaultValue={f.prazoDias ? String(f.prazoDias) : ""}>
              {PRAZOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Valor estimado (R$)</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input className="input" name="min" inputMode="decimal" placeholder="mín." defaultValue={f.valorMin ?? ""} />
              <input className="input" name="max" inputMode="decimal" placeholder="máx." defaultValue={f.valorMax ?? ""} />
            </div>
          </div>
          <details open={ufs.size > 0}>
            <summary>Estados {ufs.size > 0 && `(${ufs.size})`}</summary>
            <div className="chips">
              {UFS.map((u) => (
                <label key={u} className="chip">
                  <input type="checkbox" name="uf" value={u} defaultChecked={ufs.has(u)} />
                  <span>{u}</span>
                </label>
              ))}
            </div>
          </details>
          <details open={mods.size > 0}>
            <summary>Modalidades {mods.size > 0 && `(${mods.size})`}</summary>
            <div className="stack" style={{ gap: 4 }}>
              {MODALIDADES_BUSCA.map(([id, n]) => (
                <label key={id} className="check">
                  <input type="checkbox" name="modalidade" value={id} defaultChecked={mods.has(id)} /> {n}
                </label>
              ))}
            </div>
          </details>
          <label className="check">
            <input type="checkbox" name="encerradas" value="1" defaultChecked={!f.abertas} /> Incluir encerrados
          </label>
          <button className="btn btn-primary">Aplicar filtros</button>
          <Link className="btn btn-ghost btn-sm" href="/buscar">
            Limpar
          </Link>
        </aside>

        <section className="stack" style={{ minWidth: 0 }}>
          <div className="searchbar">
            <input
              className="input input-lg"
              name="q"
              defaultValue={f.palavras}
              placeholder="notebook, computador portátil, impressora -locação"
              aria-label="Palavras-chave"
            />
            <button className="btn btn-primary btn-lg">
              <Icon name="search" /> Buscar
            </button>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="small muted">
                <b className="num" style={{ color: "var(--text)" }}>
                  {formatInt(total)}
                </b>{" "}
                {total === 1 ? "edital" : "editais"}
                {f.abertas ? " com propostas abertas" : ""}
              </span>
              {f.palavras && (
                <button className="btn btn-sm" formAction={salvarBusca}>
                  <Icon name="bell" size={14} /> Salvar como alerta
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <Empty title="Nenhum edital encontrado">Tente menos palavras, outra grafia ou remova filtros de estado e valor.</Empty>
            ) : (
              rows.map((e) => <EditalItem key={e.id} e={e} />)
            )}
            {paginas > 1 && (
              <div className="pager">
                <span>
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
                      Próxima
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
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
