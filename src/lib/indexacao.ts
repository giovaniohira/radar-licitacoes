import type { Pool } from "pg";

/**
 * When a programmatic page earns a place in the index. A page that only repeats a name and a CNPJ with a
 * handful of contracts adds nothing a visitor could not get from the PNCP, so it stays out of the sitemap
 * and says `noindex, follow`. The same numbers drive both, so a page is never listed but noindex, or the reverse.
 * Counts cover contracts signed in the last 12 months. Revisit against production data (the thresholds were
 * sized on a development copy, see docs/empresa/seo-geo-plano.md, section 1.7).
 */
export const LIMIARES = {
  /** An orgao needs this many contracts, or at least one open edital. */
  orgaoContratos: 10,
  orgaoEditaisAbertos: 1,
  /** A fornecedor needs this many contracts, spread across at least this many buyers. */
  fornecedorContratos: 10,
  fornecedorOrgaos: 3,
} as const;

export function orgaoIndexavel(contratos: number, editaisAbertos: number): boolean {
  return contratos >= LIMIARES.orgaoContratos || editaisAbertos >= LIMIARES.orgaoEditaisAbertos;
}

export function fornecedorIndexavel(contratos: number, orgaos: number): boolean {
  return contratos >= LIMIARES.fornecedorContratos && orgaos >= LIMIARES.fornecedorOrgaos;
}

/** The two counts that decide an orgao page, read from the indexed columns (cheap, unlike the full analysis). */
export async function orgaoPublicavel(db: Pool, cnpj: string): Promise<boolean> {
  const { rows } = await db.query<{ contratos: string; abertos: string }>(
    `select (select count(*) from contratos where orgao_cnpj = $1 and data_assinatura between current_date - 365 and current_date) as contratos,
            (select count(*) from editais where cnpj = $1 and encerramento > now()) as abertos`,
    [cnpj],
  );
  return orgaoIndexavel(Number(rows[0]?.contratos ?? 0), Number(rows[0]?.abertos ?? 0));
}

export async function fornecedorPublicavel(db: Pool, ni: string): Promise<boolean> {
  const { rows } = await db.query<{ contratos: string; orgaos: string }>(
    `select count(*) as contratos, count(distinct orgao_cnpj) as orgaos from contratos
     where fornecedor_ni = $1 and data_assinatura between current_date - 365 and current_date`,
    [ni],
  );
  return fornecedorIndexavel(Number(rows[0]?.contratos ?? 0), Number(rows[0]?.orgaos ?? 0));
}

/** `robots` metadata for a page below the threshold: still followable, never listed. */
export const FINA = { robots: { index: false, follow: true } } as const;
