import Link from "next/link";
import { formatBRLCompact, formatDiaCurto, formatInt } from "@/lib/format";

/** Horizontal bars: a ranked list where each row carries its share of the top value. */
export function HBars({
  rows,
  href,
  metric = "valor",
}: {
  rows: { id: string; nome: string; n: number; valor: number }[];
  href?: (id: string) => string;
  metric?: "valor" | "n";
}) {
  const max = Math.max(1, ...rows.map((r) => r[metric]));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.id}>
          <span className="name" title={r.nome}>
            {href ? <Link href={href(r.id)}>{r.nome}</Link> : r.nome}
          </span>
          <span className="v">
            {metric === "valor" ? `${formatBRLCompact(r.valor)} · ${formatInt(r.n)}` : formatInt(r.n)}
          </span>
          <span className="track">
            <i style={{ width: `${Math.max(1.5, (r[metric] / max) * 100)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars over time (weekly). Pure SVG: scales with its container, colors come from CSS tokens. */
export function Bars({ points, metric = "valor" }: { points: { semana: string; n: number; valor: number }[]; metric?: "valor" | "n" }) {
  const W = 640;
  const H = 180;
  const pad = { l: 44, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...points.map((p) => p[metric]));
  const bw = (W - pad.l - pad.r) / Math.max(points.length, 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const fmt = (v: number) => (metric === "valor" ? formatBRLCompact(v) : formatInt(Math.round(v)));
  const every = Math.ceil(points.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Contratos por semana">
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">
            {t === 0 ? "0" : fmt(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={String(p.semana)}>
          <rect className="bar" x={pad.l + i * bw + (bw - Math.min(bw * 0.7, 40)) / 2} y={y(p[metric])} width={Math.min(bw * 0.7, 40)} height={Math.max(0, H - pad.b - y(p[metric]))} rx={2}>
            <title>{`Semana de ${formatDiaCurto(p.semana)}: ${formatInt(p.n)} contratos, ${formatBRLCompact(p.valor)}`}</title>
          </rect>
          {i % every === 0 && (
            <text className="axis" x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle">
              {formatDiaCurto(p.semana)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
