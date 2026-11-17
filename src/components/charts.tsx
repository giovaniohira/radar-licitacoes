import Link from "next/link";
import { formatBRLCompact, formatDiaCurto, formatInt, nome } from "@/lib/format";
import type { Ranking } from "@/lib/mercado";

const contratos = (n: number) => `${formatInt(n)} ${n === 1 ? "contrato" : "contratos"}`;

/** "Prefeitura de Campinas" -> "PC", for the profile tile. */
export function iniciais(s: string) {
  return nome(s)
    .split(/\s+/)
    .filter((w) => w.length > 2 && /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

/** Ranked counterparties as plain rows: name, number of contracts, value. */
export function ListaRanking({ rows, href }: { rows: Ranking[]; href: (id: string) => string }) {
  return (
    <div className="lista-f">
      {rows.map((r) => (
        <div key={r.id}>
          <Link href={href(r.id)} title={nome(r.nome)}>
            {nome(r.nome)}
          </Link>
          <span className="subtle nowrap">{contratos(r.n)}</span>
          <span className="v">{formatBRLCompact(r.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/** Ranked list: each row shows its value and a bar with its share of the top one. */
export function HBars({
  rows,
  href,
  metric = "valor",
  escuro,
}: {
  rows: { id: string; nome: string; n: number; valor: number }[];
  href?: (id: string) => string;
  metric?: "valor" | "n";
  escuro?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r[metric]));
  return (
    <div className={`hbars${escuro ? " escuro" : ""}`}>
      {rows.map((r) => (
        <div className="hbar" key={r.id}>
          <div className="top">
            {href ? (
              <Link href={href(r.id)} title={r.nome}>
                {r.nome}
              </Link>
            ) : (
              <span title={r.nome}>{r.nome}</span>
            )}
            <span className="v">{metric === "valor" ? formatBRLCompact(r.valor) : contratos(r.n)}</span>
          </div>
          <div className="track">
            <i style={{ width: `${Math.max(1.5, (r[metric] / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Weekly contracted value as columns; values are printed on top while there is room for them. */
export function Bars({ points }: { points: { semana: string; n: number; valor: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.valor));
  const n = Math.max(points.length, 1);
  const gap = n > 20 ? 4 : n > 10 ? 8 : 16;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap };
  const rotulos = n <= 10;
  const every = Math.ceil(n / 8);
  return (
    <>
      <div className="vbars" style={cols} role="img" aria-label={`Valor contratado por semana: ${points.map((p) => `${formatDiaCurto(p.semana)} ${formatBRLCompact(p.valor)}`).join(", ")}`}>
        {points.map((p) => (
          <div key={String(p.semana)} title={`Semana de ${formatDiaCurto(p.semana)}: ${formatInt(p.n)} contratos, ${formatBRLCompact(p.valor)}`}>
            {rotulos && <span>{formatBRLCompact(p.valor)}</span>}
            <i style={{ height: `${Math.max(2, (p.valor / max) * 140)}px` }} />
          </div>
        ))}
      </div>
      <div className="vlabels" style={cols} aria-hidden>
        {points.map((p, i) => (
          <span key={String(p.semana)}>{i % every === 0 ? formatDiaCurto(p.semana) : ""}</span>
        ))}
      </div>
    </>
  );
}
