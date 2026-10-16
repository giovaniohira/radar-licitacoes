import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { EditalCard } from "@/components/EditalCard";
import { query } from "@/lib/db";
import { parseFiltros } from "@/lib/params";
import { MODALIDADES } from "@/lib/pncp";
import { buildSearch, type EditalResumo } from "@/lib/search";
import { UFS } from "@/lib/setores";

const POR_PAGINA = 25;

async function BuscarConteudo({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const { sql, params } = buildSearch(f, { limit: POR_PAGINA, offset: (f.pagina - 1) * POR_PAGINA });
  const rows = await query<EditalResumo>(sql, params);
  const total = Number(rows[0]?.total ?? 0);
  const paginas = Math.ceil(total / POR_PAGINA);

  const link = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v ? [v] : []) if (k !== "p") u.append(k, x);
    u.set("p", String(p));
    return `/buscar?${u}`;
  };

  return (
    <main>
      <h2>Buscar editais</h2>
      <Form className="filters" action="/buscar">
        <label className="q">
          Palavras-chave (vírgula separa alternativas)
          <input name="q" defaultValue={f.palavras} placeholder="notebook, computador, impressora -locação" />
        </label>
        <label>
          UF
          <select name="uf" defaultValue={f.ufs?.[0] ?? ""}>
            <option value="">Todas</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Modalidade
          <select name="modalidade" defaultValue={String(f.modalidades?.[0] ?? "")}>
            <option value="">Todas</option>
            {Object.entries(MODALIDADES)
              .filter(([id]) => id !== "9")
              .map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
          </select>
        </label>
        <label>
          Valor máximo (R$)
          <input name="max" inputMode="decimal" defaultValue={f.valorMax ?? ""} placeholder="ex.: 80000" />
        </label>
        <button type="submit">Buscar</button>
      </Form>

      <p className="muted small">
        {total.toLocaleString("pt-BR")} {total === 1 ? "edital" : "editais"} {f.abertas ? "com propostas abertas" : ""}.{" "}
        {f.abertas ? <Link href={`${link(1)}&encerradas=1`}>Incluir encerrados</Link> : null}
      </p>

      <div className="results">
        {rows.map((e) => (
          <EditalCard key={e.id} e={e} />
        ))}
        {rows.length === 0 && <div className="card muted">Nada encontrado. Tente menos palavras ou outra UF.</div>}
      </div>

      {paginas > 1 && (
        <div className="pager">
          {f.pagina > 1 && (
            <Link className="btn ghost" href={link(f.pagina - 1)}>
              ← Anterior
            </Link>
          )}
          <span className="muted small" style={{ alignSelf: "center" }}>
            página {f.pagina} de {paginas}
          </span>
          {f.pagina < paginas && (
            <Link className="btn ghost" href={link(f.pagina + 1)}>
              Próxima →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

export default function Buscar(props: PageProps<"/buscar">) {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <BuscarConteudo {...props} />
    </Suspense>
  );
}
