import Link from "next/link";
import type { ReactNode } from "react";
import { destacar, formatBRL, formatData, frase, local, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { Icon } from "./icons";

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

/** One tender in a result list: short title, original object, buyer, value, deadline and optional row actions. */
export function EditalItem({
  e,
  extra,
  termos,
  acoes,
  apagado,
}: {
  e: EditalLinha;
  extra?: ReactNode;
  /** Alert or search keywords; the first match in the original object is highlighted. */
  termos?: string;
  acoes?: ReactNode;
  apagado?: boolean;
}) {
  const objeto = frase(e.objeto);
  const titulo = tituloCurto(objeto);
  const hit = termos ? destacar(objeto, termos) : null;
  const orgao = nome(e.orgao);
  const lugar = local(e.municipio, e.uf, orgao);
  const valor = formatBRL(e.valor_estimado);
  const urgente = prazoTom(e.encerramento) === "warn";
  return (
    <div className={`result${apagado ? " apagado" : ""}`}>
      <div className="body">
        <Link href={editalHref(e.id)} className="title clamp2">
          {titulo}
        </Link>
        {titulo !== objeto && (
          <p className="orig" title={objeto}>
            {hit ? (
              <>
                {hit[0]}
                <mark className="hl">{hit[1]}</mark>
                {hit[2]}
              </>
            ) : (
              objeto
            )}
          </p>
        )}
        <div className="meta">
          <span>{orgao}</span>
          {lugar && <span>{lugar}</span>}
          {e.modalidade && <span>{e.modalidade}</span>}
          {extra}
        </div>
      </div>
      <div className="side">
        <div className="cell">
          <span className={`valor${valor === "Sigiloso" ? " sigiloso" : ""}`}>{valor}</span>
          <span className="xs subtle">valor estimado</span>
        </div>
        <div className="cell">
          {e.encerramento ? (
            <>
              <span className={`quando${urgente ? " urgente" : ""}`}>
                {urgente && <Icon name="clock" size={14} />}
                {prazo(e.encerramento)}
              </span>
              <span className="xs subtle num">{formatData(e.encerramento)}</span>
            </>
          ) : (
            <span className="quando sem">Sem prazo</span>
          )}
        </div>
        {acoes && <div className="acoes">{acoes}</div>}
      </div>
    </div>
  );
}
