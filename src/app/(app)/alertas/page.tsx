import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SubmitButton } from "@/components/SubmitButton";
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
  const erro = first(sp.erro);
  const salvo = first(sp.salvo);
  const editar = alerts.find((a) => String(a.id) === first(sp.editar));

  return (
    <div className="page" style={{ gap: 20 }}>
      <PageHead title="Alertas" sub="Um único e-mail por dia, às 7h, só com editais que você ainda não recebeu." />
      {salvo && <div className="notice ok">{salvo === "editado" ? "Alerta atualizado." : "Busca salva como alerta."}</div>}
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
