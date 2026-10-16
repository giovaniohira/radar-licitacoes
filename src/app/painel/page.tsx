import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { query } from "@/lib/db";
import { formatBRL, formatData, prazo } from "@/lib/format";
import { MODALIDADES } from "@/lib/pncp";
import { requireUser } from "@/lib/session";
import { alternarAlerta, excluirAlerta, sair } from "../actions";
import { NovoAlerta } from "./NovoAlerta";

const STATUS_LABEL: Record<string, string> = {
  interesse: "Em análise",
  preparando: "Preparando proposta",
  enviada: "Proposta enviada",
  descartado: "Descartado",
};

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

interface Acomp {
  edital_id: string;
  status: string;
  objeto: string;
  orgao: string;
  uf: string | null;
  municipio: string | null;
  valor_estimado: string | null;
  encerramento: Date | null;
}

function buscaUrl(a: AlertRow) {
  const u = new URLSearchParams({ q: a.palavras });
  if (a.ufs[0]) u.set("uf", a.ufs[0]);
  if (a.modalidades[0]) u.set("modalidade", String(a.modalidades[0]));
  if (a.valor_max) u.set("max", a.valor_max);
  return `/buscar?${u}`;
}

async function PainelConteudo() {
  await connection();
  const user = await requireUser();
  const [alerts, acomps] = await Promise.all([
    query<AlertRow>(
      `select a.*, (select count(*) from alert_envios e where e.alert_id = a.id) as enviados
       from alerts a where a.user_id = $1 order by a.criado_em`,
      [user.id],
    ),
    query<Acomp>(
      `select a.edital_id, a.status, e.objeto, e.orgao, e.uf, e.municipio, e.valor_estimado, e.encerramento
       from acompanhamentos a join editais e on e.id = a.edital_id
       where a.user_id = $1
       order by (a.status = 'descartado'), e.encerramento asc nulls last`,
      [user.id],
    ),
  ]);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2>Painel</h2>
        <form action={sair} className="small muted">
          {user.email} · <button className="link">sair</button>
        </form>
      </div>

      <h2>Acompanhando</h2>
      {acomps.length === 0 ? (
        <p className="muted">
          Nenhum edital marcado ainda. Abra um edital e escolha um status para ele aparecer aqui com o prazo.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Edital</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Propostas até</th>
              </tr>
            </thead>
            <tbody>
              {acomps.map((a) => (
                <tr key={a.edital_id} style={a.status === "descartado" ? { opacity: 0.55 } : undefined}>
                  <td>
                    <Link href={`/edital/${encodeURIComponent(a.edital_id)}`}>{a.objeto.slice(0, 120)}</Link>
                    <div className="muted small">
                      {a.orgao} · {[a.municipio, a.uf].filter(Boolean).join("/")}
                    </div>
                  </td>
                  <td>{STATUS_LABEL[a.status]}</td>
                  <td>{formatBRL(a.valor_estimado)}</td>
                  <td>
                    {formatData(a.encerramento)}
                    <div className="small muted">{prazo(a.encerramento)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Meus alertas</h2>
      {alerts.length === 0 && <p className="muted">Você ainda não tem alertas. Crie o primeiro abaixo.</p>}
      <div className="results">
        {alerts.map((a) => (
          <div key={a.id} className="card edital">
            <div>
              <span className="obj">{a.nome}</span> {!a.ativo && <span className="pill off">pausado</span>}
              <div className="meta">{a.palavras}</div>
              <div className="meta">
                {a.ufs.length ? a.ufs.join(", ") : "Todas as UFs"} ·{" "}
                {a.modalidades.length ? a.modalidades.map((m) => MODALIDADES[m]).join(", ") : "todas as modalidades"}
                {a.valor_min || a.valor_max ? ` · ${formatBRL(a.valor_min ?? 0)} a ${a.valor_max ? formatBRL(a.valor_max) : "∞"}` : ""}
              </div>
            </div>
            <div className="side">
              <div className="muted">{a.enviados} enviados</div>
              <Link href={buscaUrl(a)}>ver agora</Link>
              <form action={alternarAlerta}>
                <input type="hidden" name="id" value={a.id} />
                <button className="link">{a.ativo ? "pausar" : "reativar"}</button>
              </form>
              <form action={excluirAlerta}>
                <input type="hidden" name="id" value={a.id} />
                <button className="link" style={{ color: "var(--danger)" }}>
                  excluir
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2>Novo alerta</h2>
      <NovoAlerta />
    </main>
  );
}

export default function Painel() {
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 32 }}>Carregando…</p>}>
      <PainelConteudo  />
    </Suspense>
  );
}
