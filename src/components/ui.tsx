import Link from "next/link";
import type { ReactNode } from "react";
import { formatBRLCompact, frase, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { etapaLabel } from "@/lib/pipeline";
import { adicionarAoPipeline, removerDoPipeline } from "@/app/actions/pipeline";
import { Icon } from "./icons";
import { SubmitButton } from "./SubmitButton";

export const editalHref = (id: string) => `/edital/${encodeURIComponent(id)}`;

/** Compact money for lists; PNCP's secret budgets come as 0. */
export const valorCurto = (v: number | string | null | undefined) => (v == null || Number(v) === 0 ? "Sigiloso" : formatBRLCompact(v));

export function PrazoPill({ d }: { d: Date | string | null }) {
  return <span className={`pill${prazoTom(d) === "warn" ? " urg" : ""}`}>{prazo(d)}</span>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="kpi">
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
      {children && <div>{children}</div>}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="page" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div style={{ display: "grid", gap: 10 }}>
        <span className="sk" style={{ width: 160, height: 12 }} />
        <span className="sk" style={{ width: 320, height: 28 }} />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[70, 55, 80, 60].map((w) => (
          <div key={w} className="sk-row">
            <span className="sk" style={{ width: `${w}%`, height: 14 }} />
            <span className="sk" style={{ width: `${w - 25}%`, height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface EditalLinha {
  id: string;
  objeto: string;
  orgao: string;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  valor_estimado: number | string | null;
  encerramento: Date | string | null;
}

/** Horizontal-scroll box for edital rows, so the four columns never squeeze on a phone. */
export function EditalRows({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll">
      <div className="erows">{children}</div>
    </div>
  );
}

/** One tender: short title, buyer · UF · modality, estimated value, deadline and the row's actions. */
export function EditalRow({ e, acoes, apagado }: { e: EditalLinha; acoes?: ReactNode; apagado?: boolean }) {
  const meta = [nome(e.orgao), e.uf, e.modalidade].filter(Boolean).join(" · ");
  return (
    <div className={`erow${apagado ? " apagado" : ""}`}>
      <div style={{ minWidth: 0 }}>
        <Link href={editalHref(e.id)} className="t" title={frase(e.objeto)}>
          {tituloCurto(frase(e.objeto))}
        </Link>
        <div className="m">{meta}</div>
      </div>
      <div className="v">{valorCurto(e.valor_estimado)}</div>
      <div>{e.encerramento ? <PrazoPill d={e.encerramento} /> : <span className="pill">sem prazo</span>}</div>
      <div className="acts">{acoes}</div>
    </div>
  );
}

/** "Tenho interesse" / "Não é pra mim" on an untouched edital; its stage (or an undo for discards) once it is tracked. */
export function Interesse({ id, etapa }: { id: string; etapa?: string }) {
  if (etapa === "descartada") {
    return (
      <form action={removerDoPipeline}>
        <input type="hidden" name="edital" value={id} />
        <span className="xs subtle">Descartado</span>
        <SubmitButton className="btn btn-ghost btn-sm">Desfazer</SubmitButton>
      </form>
    );
  }
  if (etapa) {
    return (
      <Link className="etapa-tag" href="/pipeline">
        <Icon name="check" size={13} strokeWidth={2.4} />
        {etapaLabel(etapa)}
      </Link>
    );
  }
  return (
    <>
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={id} />
        <SubmitButton className="btn btn-primary btn-sm">Tenho interesse</SubmitButton>
      </form>
      <form action={adicionarAoPipeline}>
        <input type="hidden" name="edital" value={id} />
        <input type="hidden" name="etapa" value="descartada" />
        <SubmitButton className="btn btn-sm" style={{ color: "var(--muted)" }}>
          Não é pra mim
        </SubmitButton>
      </form>
    </>
  );
}
