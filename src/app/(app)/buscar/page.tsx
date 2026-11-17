import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { AutoSelect } from "@/components/AutoSelect";
import { EditalRow, EditalRows, Empty, Interesse, Loading, PageHead } from "@/components/ui";
import { query } from "@/lib/db";
import { formatBRLCompact, formatInt } from "@/lib/format";
import { parseFiltros, withParams } from "@/lib/params";
import { MODALIDADES } from "@/lib/pncp";
import { ORDENS, buildSearch, type EditalResumo } from "@/lib/search";
import { currentUser } from "@/lib/session";
import { SETORES, UFS } from "@/lib/setores";
import { salvarBusca } from "../../actions/alertas";

export const metadata: Metadata = { title: "Encontrar editais" };

const POR_PAGINA = 25;
const MODALIDADES_BUSCA = Object.entries(MODALIDADES).filter(([id]) => id !== "9");
const PRAZOS = [
  ["", "Qualquer prazo"],
  ["3", "Fecha em até 3 dias"],
  ["7", "Fecha em até 7 dias"],
  ["15", "Fecha em até 15 dias"],
  ["30", "Fecha em até 30 dias"],
] as const;

function faixaValor(min?: number | null, max?: number | null) {
  if (min != null && max != null) return `${formatBRLCompact(min)} a ${formatBRLCompact(max)}`;
  if (min != null) return `Acima de ${formatBRLCompact(min)}`;
  if (max != null) return `Até ${formatBRLCompact(max)}`;
  return "Qualquer valor";
}

async function Busca({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const { sql, params } = buildSearch(f, { limit: POR_PAGINA, offset: (f.pagina - 1) * POR_PAGINA });
  const [rows, user] = await Promise.all([query<EditalResumo>(sql, params), currentUser()]);
  const etapas =
    user && rows.length
      ? new Map(
          (await query<{ edital_id: string; etapa: string }>(`select edital_id, etapa from pipeline where user_id = $1 and edital_id = any($2::text[])`, [user.id, rows.map((r) => r.id)])).map(
            (r) => [r.edital_id, r.etapa],
          ),
        )
      : new Map<string, string>();
  const total = Number(rows[0]?.total ?? 0);
  const paginas = Math.ceil(total / POR_PAGINA);
  const ufs = new Set(f.ufs);
  const mods = new Set(f.modalidades?.map(String));
  const temFiltro = ufs.size > 0 || mods.size > 0 || f.valorMin != null || f.valorMax != null || !!f.prazoDias || !f.abertas;

  return (
    <div className="page" style={{ gap: 20 }}>
      <PageHead title="Encontrar editais" sub="Todos os editais abertos no PNCP, de órgãos federais, estaduais e municipais." />

      <Form id="busca" action="/buscar" className="stack" style={{ gap: 20 }}>
        <section className="card card-pad stack" style={{ gap: 14 }}>
          <div className="row" style={{ alignItems: "stretch" }}>
            <label className="searchbox">
              <Icon name="search" size={18} />
              <span className="sr-only">O que sua empresa vende?</span>
              <input name="q" defaultValue={f.palavras} placeholder="O que você vende? ex.: notebook, merenda escolar, reforma" />
            </label>
            <button className="btn btn-primary btn-lg">Buscar</button>
          </div>
          <div className="row small" style={{ gap: 6 }}>
            <span className="muted">Não sabe que palavra usar? Comece pelo setor:</span>
            {SETORES.map((s) => (
              <Link key={s.id} className="chip-link" href={`/buscar?q=${encodeURIComponent(s.palavras)}`}>
                {s.nome}
              </Link>
            ))}
          </div>
          <div className="filters" role="group" aria-label="Filtros">
            <div className="dd">
              Estado
              <details className="dd">
                <summary>
                  <span>{ufs.size ? [...ufs].join(", ") : "Brasil inteiro"}</span>
                </summary>
                <div className="menu-pop">
                  <div className="uf-chips">
                    {UFS.map((u) => (
                      <label key={u}>
                        <input type="checkbox" name="uf" value={u} defaultChecked={ufs.has(u)} />
                        <span>{u}</span>
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-sm">Aplicar</button>
                </div>
              </details>
            </div>
            <div className="dd">
              Modalidade
              <details className="dd">
                <summary>
                  <span>{mods.size ? [...mods].map((m) => MODALIDADES[Number(m)]).join(", ") : "Todas"}</span>
                </summary>
                <div className="menu-pop" style={{ gap: 6 }}>
                  {MODALIDADES_BUSCA.map(([id, n]) => (
                    <label key={id} className="check">
                      <input type="checkbox" name="modalidade" value={id} defaultChecked={mods.has(id)} /> {n}
                    </label>
                  ))}
                  <button className="btn btn-primary btn-sm">Aplicar</button>
                </div>
              </details>
            </div>
            <div className="dd">
              Valor estimado
              <details className="dd">
                <summary>
                  <span>{faixaValor(f.valorMin, f.valorMax)}</span>
                </summary>
                <div className="menu-pop">
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input className="input" name="min" inputMode="decimal" placeholder="mín. R$" aria-label="Valor mínimo" defaultValue={f.valorMin ?? ""} />
                    <input className="input" name="max" inputMode="decimal" placeholder="máx. R$" aria-label="Valor máximo" defaultValue={f.valorMax ?? ""} />
                  </div>
                  <button className="btn btn-primary btn-sm">Aplicar</button>
                </div>
              </details>
            </div>
            <label>
              Prazo da proposta
              <AutoSelect name="prazo" defaultValue={f.prazoDias ? String(f.prazoDias) : ""}>
                {PRAZOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </AutoSelect>
            </label>
          </div>
          <div className="filters-foot">
            <label className="check">
              <input type="checkbox" name="encerradas" value="1" defaultChecked={!f.abertas} /> Incluir encerrados
            </label>
            <span className="xs subtle">Vírgula busca qualquer termo, hífen exclui (-locação), aspas buscam a frase exata.</span>
            {temFiltro && (
              <Link href={`/buscar${withParams({ q: f.palavras || undefined }, {})}`} style={{ marginLeft: "auto" }}>
                Limpar filtros
              </Link>
            )}
          </div>
        </section>

        {f.palavras && (
          <div className="guide">
            <Icon name="bell" size={20} />
            <div className="body">
              <div style={{ fontWeight: 600 }}>Gostou dessa busca? Não precisa refazer amanhã.</div>
              <p>Salve como alerta e os editais novos chegam no seu e-mail às 7h.</p>
            </div>
            <button className="btn btn-primary" formAction={salvarBusca}>
              Salvar como alerta
            </button>
          </div>
        )}
      </Form>

      <section className="card" style={{ overflow: "hidden" }}>
        <div className="card-head" style={{ padding: "12px 16px" }}>
          <span className="small muted">
            <b className="num" style={{ color: "var(--text)" }}>
              {formatInt(total)}
            </b>{" "}
            {total === 1 ? "edital" : "editais"}
            {f.abertas && (total === 1 ? " aberto" : " abertos")}
          </span>
          <label className="row small muted" style={{ gap: 6 }}>
            Ordenar por
            <AutoSelect form="busca" className="input" name="ordem" defaultValue={f.ordem ?? ""} style={{ width: "auto", height: 30 }}>
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
          <EditalRows>
            {rows.map((e) => (
              <EditalRow key={e.id} e={e} apagado={etapas.get(e.id) === "descartada"} acoes={<Interesse id={e.id} etapa={etapas.get(e.id)} />} />
            ))}
          </EditalRows>
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
