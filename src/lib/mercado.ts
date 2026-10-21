import type { Pool } from "pg";
import { toWebsearch } from "./search";

/** Market questions over signed contracts: who buys, who wins, at what price. All SQL is parameterized. */
export interface MercadoFiltro {
  q?: string;
  uf?: string;
  dias?: number;
  orgao?: string;
  fornecedor?: string;
}

export const PERIODOS = [30, 90, 180, 365] as const;

export function whereContratos(f: MercadoFiltro) {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const q = f.q ? toWebsearch(f.q) : "";
  if (q) where.push(`busca @@ websearch_to_tsquery('portuguese', f_unaccent(${p(q)}))`);
  if (f.uf && /^[A-Z]{2}$/.test(f.uf)) where.push(`uf = ${p(f.uf)}`);
  if (f.orgao) where.push(`orgao_cnpj = ${p(f.orgao)}`);
  if (f.fornecedor) where.push(`fornecedor_ni = ${p(f.fornecedor)}`);
  const dias = p(f.dias ?? 90);
  // Filter by publication date: ingestion goes by publication day, so this window is always complete.
  where.push(`publicado_em >= current_date - ${dias}::int`);
  return { where: `where ${where.join(" and ")}`, params, p, dias };
}

export interface Totais {
  contratos: number;
  valor: number;
  fornecedores: number;
  orgaos: number;
  mediana: number | null;
}

export interface Ranking {
  id: string;
  nome: string;
  n: number;
  valor: number;
}

export interface Ponto {
  semana: string;
  n: number;
  valor: number;
}

export interface Faixa {
  faixa: string;
  n: number;
}

const FAIXAS = `case
  when valor_global < 10000 then '1|até R$ 10 mil'
  when valor_global < 50000 then '2|R$ 10–50 mil'
  when valor_global < 200000 then '3|R$ 50–200 mil'
  when valor_global < 1000000 then '4|R$ 200 mil–1 mi'
  else '5|acima de R$ 1 mi' end`;

export async function analisar(db: Pool, f: MercadoFiltro) {
  const { where, params, dias } = whereContratos(f);
  const run = <T extends object>(sql: string) => db.query<T>(sql, params).then((r) => r.rows);
  const [[totais], serie, orgaos, fornecedores, ufs, faixas, categorias] = await Promise.all([
    run<Totais>(`select count(*)::int as contratos, coalesce(sum(valor_global), 0)::float8 as valor,
                        count(distinct fornecedor_ni)::int as fornecedores, count(distinct orgao_cnpj)::int as orgaos,
                        (percentile_cont(0.5) within group (order by valor_global) filter (where valor_global > 0))::float8 as mediana
                 from contratos ${where}`),
    // Every week of the period, including empty ones, so gaps show as gaps instead of wide bars.
    run<Ponto>(`with s as (
                  select date_trunc('week', publicado_em)::date as semana, count(*)::int as n, sum(valor_global)::float8 as valor
                  from contratos ${where} group by 1)
                select w::date::text as semana, coalesce(s.n, 0) as n, coalesce(s.valor, 0) as valor
                from generate_series(date_trunc('week', current_date - ${dias}::int), date_trunc('week', current_date), interval '1 week') w
                left join s on s.semana = w::date
                order by w`),
    run<Ranking>(`select orgao_cnpj as id, max(orgao) as nome, count(*)::int as n, coalesce(sum(valor_global), 0)::float8 as valor
                  from contratos ${where} group by 1 order by valor desc limit 10`),
    run<Ranking>(`select fornecedor_ni as id, max(fornecedor) as nome, count(*)::int as n, coalesce(sum(valor_global), 0)::float8 as valor
                  from contratos ${where} and fornecedor_ni is not null group by 1 order by valor desc limit 10`),
    run<Ranking>(`select uf as id, uf as nome, count(*)::int as n, coalesce(sum(valor_global), 0)::float8 as valor
                  from contratos ${where} and uf is not null group by 1 order by valor desc`),
    run<Faixa>(`select ${FAIXAS} as faixa, count(*)::int as n from contratos ${where} and valor_global > 0 group by 1 order by 1`),
    run<Ranking>(`select coalesce(categoria, 'Outros') as id, coalesce(categoria, 'Outros') as nome, count(*)::int as n,
                         coalesce(sum(valor_global), 0)::float8 as valor
                  from contratos ${where} group by 1 order by valor desc limit 8`),
  ]);
  return {
    totais,
    serie,
    orgaos,
    fornecedores,
    ufs,
    faixas: faixas.map((x) => ({ ...x, faixa: x.faixa.split("|")[1] })),
    categorias,
  };
}

export interface ContratoLinha {
  id: string;
  objeto: string;
  orgao: string;
  orgao_cnpj: string;
  fornecedor: string | null;
  fornecedor_ni: string | null;
  uf: string | null;
  municipio: string | null;
  valor_global: number | null;
  data_assinatura: string | null;
  compra_id: string | null;
  tem_edital: boolean;
}

export async function contratosRecentes(db: Pool, f: MercadoFiltro, limit = 20): Promise<ContratoLinha[]> {
  const { where, params, p } = whereContratos(f);
  const { rows } = await db.query<ContratoLinha>(
    `select id, objeto, orgao, orgao_cnpj, fornecedor, fornecedor_ni, uf, municipio,
            valor_global::float8 as valor_global, data_assinatura, compra_id,
            exists (select 1 from editais e where e.id = contratos.compra_id) as tem_edital
     from contratos ${where}
     order by data_assinatura desc nulls last, valor_global desc nulls last
     limit ${p(limit)}`,
    params,
  );
  return rows;
}

/** Who this buyer is, from whichever table has seen it. */
export async function orgaoInfo(db: Pool, cnpj: string) {
  const { rows } = await db.query<{ nome: string; uf: string | null; municipio: string | null; esfera: string | null }>(
    `(select orgao as nome, uf, municipio, esfera from editais where cnpj = $1 order by publicado_em desc limit 1)
     union all
     (select orgao, uf, municipio, esfera from contratos where orgao_cnpj = $1 order by data_assinatura desc limit 1)
     limit 1`,
    [cnpj],
  );
  return rows[0] ?? null;
}

export async function fornecedorInfo(db: Pool, ni: string) {
  const { rows } = await db.query<{ nome: string; desde: string | null }>(
    `select max(fornecedor) as nome, min(data_assinatura) as desde from contratos where fornecedor_ni = $1 having count(*) > 0`,
    [ni],
  );
  return rows[0] ?? null;
}
