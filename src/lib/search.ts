export interface Filtros {
  palavras?: string;
  ufs?: string[];
  modalidades?: number[];
  valorMin?: number | null;
  valorMax?: number | null;
  /** Only editais still accepting proposals. Default true. */
  abertas?: boolean;
  /** Only editais ingested after this instant (used by alerts). */
  desde?: Date;
  /** Exclude editais already sent for this alert. */
  excluirEnviadosAlerta?: number;
  /** Proposals close within this many days. */
  prazoDias?: number | null;
  ordem?: Ordem;
}

export const ORDENS = { relevancia: "Relevância", prazo: "Prazo mais próximo", recentes: "Mais recentes", valor: "Maior valor" } as const;
export type Ordem = keyof typeof ORDENS;

/**
 * Turns "notebook, computador portátil; impressora -locação" into a websearch_to_tsquery string:
 * comma/semicolon/newline separate alternatives, spaces inside one alternative mean AND,
 * quotes keep phrases and a leading "-" excludes a term. In tsquery & binds tighter than |,
 * so "a b or c" means (a & b) | c.
 */
export function toWebsearch(palavras: string): string {
  return palavras
    .split(/[,;\n]+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" or ");
}

const UF_RE = /^[A-Z]{2}$/;

export function buildSearch(f: Filtros, { limit = 50, offset = 0 } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  let rank = "0::real";
  const q = f.palavras ? toWebsearch(f.palavras) : "";
  if (q) {
    const tsq = `websearch_to_tsquery('portuguese', f_unaccent(${p(q)}))`;
    where.push(`busca @@ ${tsq}`);
    rank = `ts_rank(busca, ${tsq})`;
  }
  const ufs = (f.ufs ?? []).map((u) => u.toUpperCase()).filter((u) => UF_RE.test(u));
  if (ufs.length) where.push(`uf = any(${p(ufs)}::text[])`);
  const mods = (f.modalidades ?? []).filter((m) => Number.isInteger(m));
  if (mods.length) where.push(`modalidade_id = any(${p(mods)}::int[])`);
  if (f.valorMin != null) where.push(`valor_estimado >= ${p(f.valorMin)}`);
  if (f.valorMax != null) where.push(`valor_estimado <= ${p(f.valorMax)}`);
  // Many dispensas carry no closing date; treat those as open for 15 days after publication.
  if (f.abertas ?? true) {
    where.push(`(encerramento > now() or (encerramento is null and publicado_em > now() - interval '15 days'))`);
  }
  if (f.prazoDias) where.push(`encerramento < now() + make_interval(days => ${p(f.prazoDias)})`);
  if (f.desde) where.push(`ingerido_em > ${p(f.desde)}`);
  if (f.excluirEnviadosAlerta != null) {
    where.push(`not exists (select 1 from alert_envios ae where ae.alert_id = ${p(f.excluirEnviadosAlerta)} and ae.edital_id = editais.id)`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const ordem = f.ordem ?? (q ? "relevancia" : "prazo");
  const orderBy = {
    relevancia: `${q ? "rank desc, " : ""}encerramento asc nulls last, publicado_em desc`,
    prazo: "encerramento asc nulls last, publicado_em desc",
    recentes: "publicado_em desc nulls last",
    valor: "valor_estimado desc nulls last, encerramento asc nulls last",
  }[ordem];
  const sql = `
    select id, cnpj, ano, sequencial, orgao, unidade, uf, municipio, objeto, modalidade_id, modalidade, situacao,
           valor_estimado::float8 as valor_estimado, abertura, encerramento, publicado_em, ${rank} as rank,
           count(*) over () as total
    from editais ${whereSql}
    order by ${orderBy}, id
    limit ${p(limit)} offset ${p(offset)}`;
  return { sql, params };
}

export interface EditalResumo {
  id: string;
  cnpj: string;
  ano: number;
  sequencial: number;
  orgao: string;
  unidade: string | null;
  uf: string | null;
  municipio: string | null;
  objeto: string;
  modalidade_id: number;
  modalidade: string | null;
  situacao: string | null;
  valor_estimado: number | null;
  abertura: Date | null;
  encerramento: Date | null;
  publicado_em: Date | null;
  rank: number;
  total: string;
}
