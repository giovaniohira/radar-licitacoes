import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, Loading, PageHead } from "@/components/ui";
import { MAX_CONCORRENTES, listarSeguidos } from "@/lib/concorrentes";
import { pool, query } from "@/lib/db";
import { formatBRLCompact, formatDia, formatInt, horasAtras, nome } from "@/lib/format";
import { first } from "@/lib/params";
import { MODALIDADES } from "@/lib/pncp";
import { buildSearch } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { alternarAlerta, excluirAlerta } from "../../actions/alertas";
import { pararForm } from "../../actions/concorrentes";
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

function filtros(a: AlertRow) {
  const faixa =
    a.valor_min && a.valor_max
      ? `${formatBRLCompact(a.valor_min)} a ${formatBRLCompact(a.valor_max)}`
      : a.valor_max
        ? `até ${formatBRLCompact(a.valor_max)}`
        : a.valor_min
          ? `a partir de ${formatBRLCompact(a.valor_min)}`
          : "qualquer valor";
  const mods = a.modalidades.length ? a.modalidades.map((m) => MODALIDADES[m]).join(", ") : "todas as modalidades";
  return `${a.ufs.length ? a.ufs.join(", ") : "Brasil inteiro"} · ${mods} · ${faixa}`;
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
  const seguidos = await listarSeguidos(pool(), user.id);
  const erro = first(sp.erro);
  const salvo = first(sp.salvo);
  const editar = alerts.find((a) => String(a.id) === first(sp.editar));

  return (
    <div className="page" style={{ gap: 20 }}>
      <PageHead title="Alertas" sub="No máximo um e-mail por dia, às 7h, só com editais que você ainda não recebeu." />
      {salvo && <div className="notice ok">{salvo === "editado" ? "Alerta atualizado." : "Busca salva como alerta."}</div>}
      {first(sp.parou) && <div className="notice ok">Você parou de acompanhar essa empresa.</div>}
      {erro && <div className="notice">{erro}</div>}

      <div className="cols">
        <div className="col-main" style={{ gap: 12 }}>
          {alerts.length === 0 ? (
            <div className="card">
              <Empty title="Nenhum alerta ainda">Crie o primeiro ao lado ou use “Salvar como alerta” em qualquer busca.</Empty>
            </div>
          ) : (
            alerts.map((a, i) => (
              <article key={a.id} className={`card acard${a.ativo ? "" : " pausado"}`}>
                <div className="spread" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                    <div className="row">
                      <h2>{a.nome}</h2>
                      <span className={`pill${a.ativo ? " ok" : ""}`}>{a.ativo ? "ativo" : "pausado"}</span>
                    </div>
                    <p>{a.palavras}</p>
                    <p>{filtros(a)}</p>
                  </div>
                  <div className="acts">
                    <Link className="btn btn-sm" href={buscaUrl(a)}>
                      Ver editais
                    </Link>
                    <Link className="btn btn-ghost btn-sm" href={`/alertas?editar=${a.id}#novo`}>
                      Editar
                    </Link>
                    <form action={alternarAlerta}>
                      <input type="hidden" name="id" value={a.id} />
                      <SubmitButton className="btn btn-ghost btn-sm">{a.ativo ? "Pausar" : "Reativar"}</SubmitButton>
                    </form>
                    <form action={excluirAlerta}>
                      <input type="hidden" name="id" value={a.id} />
                      <SubmitButton className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>
                        Excluir
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <div className="trio">
                  <div>
                    Novos 24h<b>{formatInt(contagens[i].novos)}</b>
                  </div>
                  <div>
                    Abertos agora<b>{formatInt(contagens[i].abertos)}</b>
                  </div>
                  <div>
                    Já enviados<b>{formatInt(a.enviados)}</b>
                  </div>
                </div>
              </article>
            ))
          )}
          <p className="small subtle">Dica: em qualquer busca, use “Salvar como alerta” para criar um alerta com os mesmos filtros.</p>

          <section className="card card-pad stack" style={{ gap: 10 }} aria-labelledby="concorrentes-h">
            <div className="card-title">
              <h2 id="concorrentes-h">Concorrentes acompanhados</h2>
              <span className="xs subtle">
                {seguidos.length} de {MAX_CONCORRENTES}
              </span>
            </div>
            {seguidos.length === 0 ? (
              <p className="small muted">
                Abra a página de uma empresa e clique em Acompanhar: os contratos novos dela chegam no e-mail das 7h. <Link href="/mercado">Ver o mercado</Link>
              </p>
            ) : (
              <ul className="seguidos-lista">
                {seguidos.map((s) => (
                  <li key={s.fornecedor_ni}>
                    <span style={{ minWidth: 0 }}>
                      <Link href={`/fornecedor/${s.fornecedor_ni}`} className="t">
                        {nome(s.nome) || s.fornecedor_ni}
                      </Link>
                      <span className="xs muted" style={{ display: "block" }}>
                        desde {formatDia(s.criado_em)}
                      </span>
                    </span>
                    <form action={pararForm}>
                      <input type="hidden" name="ni" value={s.fornecedor_ni} />
                      <SubmitButton className="btn btn-ghost btn-sm" aria-label={`Parar de acompanhar ${nome(s.nome)}`}>
                        Parar de acompanhar
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="col-side">
          <NovoAlerta key={editar?.id ?? "novo"} editar={editar} />
        </div>
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
