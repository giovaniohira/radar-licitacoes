import Link from "next/link";
import { formatBRL, formatData, prazo, urgente } from "@/lib/format";
import type { EditalResumo } from "@/lib/search";

export function EditalCard({ e }: { e: EditalResumo }) {
  const p = prazo(e.encerramento);
  return (
    <div className="card edital">
      <div>
        <Link href={`/edital/${encodeURIComponent(e.id)}`} className="obj">
          {e.objeto.length > 220 ? `${e.objeto.slice(0, 220)}…` : e.objeto}
        </Link>
        <div className="meta">
          {e.orgao} · {[e.municipio, e.uf].filter(Boolean).join("/")} · {e.modalidade}
        </div>
      </div>
      <div className="side">
        <div className="valor">{formatBRL(e.valor_estimado)}</div>
        <div className="muted">{e.encerramento ? `até ${formatData(e.encerramento)}` : "sem data de encerramento"}</div>
        <span className={`pill ${p === "encerrado" ? "off" : urgente(e.encerramento) ? "warn" : ""}`}>{p}</span>
      </div>
    </div>
  );
}
