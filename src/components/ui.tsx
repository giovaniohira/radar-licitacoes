import Link from "next/link";
import type { ReactNode } from "react";
import { formatBRL, formatData, frase, local, nome, prazo, prazoTom } from "@/lib/format";

export function PrazoBadge({ d }: { d: Date | string | null }) {
  const tom = prazoTom(d);
  return <span className={`badge${tom === "neutral" ? "" : ` b-${tom}`}`}>{prazo(d)}</span>;
}

export function PageHead({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return <div className="page muted">{label}</div>;
}

export interface EditalLinha {
  id: string;
  objeto: string;
  orgao: string;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  valor_estimado: number | string | null;
  encerramento: Date | null;
}

export const editalHref = (id: string) => `/edital/${encodeURIComponent(id)}`;

/** One tender in a result list: object, buyer, place, value and deadline. */
export function EditalItem({ e, extra }: { e: EditalLinha; extra?: ReactNode }) {
  return (
    <div className="result">
      <div style={{ minWidth: 0 }}>
        <Link href={editalHref(e.id)} className="title clamp2">
          {frase(e.objeto)}
        </Link>
        <div className="meta">
          <span>{nome(e.orgao)}</span>
          <span>{local(e.municipio, e.uf)}</span>
          {e.modalidade && <span>{e.modalidade}</span>}
          {extra}
        </div>
      </div>
      <div className="side">
        <span className="valor">{formatBRL(e.valor_estimado)}</span>
        <PrazoBadge d={e.encerramento} />
        {e.encerramento && <span className="xs subtle num">{formatData(e.encerramento)}</span>}
      </div>
    </div>
  );
}
