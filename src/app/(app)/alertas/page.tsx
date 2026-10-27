import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { Empty, Loading, PageHead } from "@/components/ui";
import { query } from "@/lib/db";
import { formatBRLCompact, formatInt, horasAtras } from "@/lib/format";
import { first } from "@/lib/params";
import { MODALIDADES } from "@/lib/pncp";
import { buildSearch } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { alternarAlerta, excluirAlerta } from "../../actions/alertas";
import { NovoAlerta } from "./NovoAlerta";

export const metadata: Metadata = { title: "Alertas", robots: { index: false } };

interface AlertRow {
  id: number;
  nome: string;
  palavras: string;
  ufs: string[];
  modalidades: number[];
  valor_min: string | null;
  valor_max: string | null;
  ativo: boolean;
  enviados: string;
}

function faixa(a: AlertRow) {
  if (a.valor_min && a.valor_max) return ` · ${formatBRLCompact(a.valor_min)} a ${formatBRLCompact(a.valor_max)}`;
  if (a.valor_max) return ` · até ${formatBRLCompact(a.valor_max)}`;
  if (a.valor_min) return ` · a partir de ${formatBRLCompact(a.valor_min)}`;
  return "";
}

function buscaUrl(a: AlertRow) {
  const u = new URLSearchParams({ q: a.palavras, ordem: "recentes" });
  for (const uf of a.ufs) u.append("uf", uf);
  for (const m of a.modalidades) u.append("modalidade", String(m));
  if (a.valor_min) u.set("min", a.valor_min);
  if (a.valor_max) u.set("max", a.valor_max);
  return `/buscar?${u}`;
}

async function Alertas({ searchParams }: PageProps<"/alertas">) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const alerts = await query<AlertRow>(
    `select a.*, (select count(*) from alert_envios e where e.alert_id = a.id) as enviados
     from alerts a where a.user_id = $1 order by a.criado_em`,
    [user.id],
  );
  const desde = horasAtras(24);
  const contagens = await Promise.all(
    alerts.map(async (a) => {
      const f = {
        palavras: a.palavras,
        ufs: a.ufs,
        modalidades: a.modalidades,
        valorMin: a.valor_min == null ? null : Number(a.valor_min),
        valorMax: a.valor_max == null ? null : Number(a.valor_max),
      };
      const [abertos, novos] = await Promise.all([buildSearch(f, { limit: 1 }), buildSearch({ ...f, desde }, { limit: 1 })].map((s) => query<{ total: string }>(s.sql, s.params)));
      return { abertos: Number(abertos[0]?.total ?? 0), novos: Number(novos[0]?.total ?? 0) };
    }),
  );
  const erro = first(sp.erro);

  return (
    <div className="page">
      <PageHead
        title="Alertas"
        sub={`Um único e-mail por dia, às 7h, para ${user.email}, só com editais que você ainda não recebeu.`}
      />
      {first(sp.salvo) && <div className="notice ok" style={{ marginBottom: 16 }}>Busca salva como alerta.</div>}
      {erro && <div className="notice danger" style={{ marginBottom: 16 }}>{erro}</div>}
      <div className="stack-lg">
        <section className="card">
          {alerts.length === 0 ? (
            <Empty title="Nenhum alerta ainda">Crie o primeiro abaixo ou use “Salvar como alerta” em qualquer busca.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Alerta</th>
                    <th>Filtros</th>
                    <th className="r">Novos 24h</th>
                    <th className="r">Abertos</th>
                    <th className="r">Enviados</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a, i) => (
                    <tr key={a.id} style={a.ativo ? undefined : { opacity: 0.55 }}>
                      <td style={{ maxWidth: 320 }}>
                        <div className="title">
                          {a.nome} {!a.ativo && <span className="badge plain">pausado</span>}
                        </div>
                        <div className="sub clamp2">{a.palavras}</div>
                      </td>
                      <td className="small muted" style={{ maxWidth: 260 }}>
                        {a.ufs.length ? a.ufs.join(", ") : "Brasil"} ·{" "}
                        {a.modalidades.length ? a.modalidades.map((m) => MODALIDADES[m]).join(", ") : "todas as modalidades"}
                        {faixa(a)}
                      </td>
                      <td className="r num">
                        {contagens[i].novos > 0 ? <span className="badge b-accent plain">{formatInt(contagens[i].novos)}</span> : "0"}
                      </td>
                      <td className="r num">{formatInt(contagens[i].abertos)}</td>
                      <td className="r num">{formatInt(a.enviados)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                          <Link className="btn btn-sm" href={buscaUrl(a)}>
                            Ver
                          </Link>
                          <form action={alternarAlerta}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn btn-ghost btn-sm" aria-label={a.ativo ? "Pausar" : "Reativar"} title={a.ativo ? "Pausar" : "Reativar"}>
                              <Icon name={a.ativo ? "pause" : "play"} size={14} />
                            </button>
                          </form>
                          <form action={excluirAlerta}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn btn-ghost btn-sm btn-danger" aria-label="Excluir" title="Excluir">
                              <Icon name="trash" size={14} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <NovoAlerta />
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/alertas">) {
  return (
    <Suspense fallback={<Loading />}>
      <Alertas {...props} />
    </Suspense>
  );
}
