import type { Filtros } from "./search";

type SP = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Parses "1.500,00", "1500" or "1500.5" into a number; empty/invalid -> null. */
export function parseValor(v: string | null | undefined): number | null {
  const s = (v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseFiltros(sp: SP): Filtros & { pagina: number } {
  return {
    palavras: first(sp.q).slice(0, 500),
    ufs: all(sp.uf).flatMap((u) => u.split(",")).filter(Boolean),
    modalidades: all(sp.modalidade).map(Number).filter((n) => n > 0),
    valorMin: parseValor(first(sp.min)),
    valorMax: parseValor(first(sp.max)),
    abertas: first(sp.encerradas) !== "1",
    pagina: Math.max(1, Math.min(200, Number(first(sp.p)) || 1)),
  };
}
