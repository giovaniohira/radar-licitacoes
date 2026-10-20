import type { Pool } from "pg";
import {
  MODALIDADES_INGERIDAS,
  fetchContratos,
  fetchPublicacoes,
  normalize,
  normalizeContrato,
  type FetchOpts,
  type PncpContratacao,
  type PncpContrato,
} from "./pncp";

const UPSERT = `
insert into editais (
  id, cnpj, ano, sequencial, orgao, unidade, uf, municipio, codigo_ibge, esfera, objeto, info_complementar,
  modalidade_id, modalidade, situacao, valor_estimado, srp, abertura, encerramento, publicado_em, atualizado_em,
  link_origem, raw
)
select r.id, r.cnpj, r.ano, r.sequencial, r.orgao, r.unidade, r.uf, r.municipio, r.codigo_ibge, r.esfera, r.objeto,
       r.info_complementar, r.modalidade_id, r.modalidade, r.situacao, r.valor_estimado, r.srp, r.abertura,
       r.encerramento, r.publicado_em, r.atualizado_em, r.link_origem, r.raw
from jsonb_to_recordset($1::jsonb) as r(
  id text, cnpj text, ano int, sequencial int, orgao text, unidade text, uf text, municipio text, codigo_ibge text,
  esfera text, objeto text, info_complementar text, modalidade_id int, modalidade text, situacao text,
  valor_estimado numeric, srp boolean, abertura timestamptz, encerramento timestamptz, publicado_em timestamptz,
  atualizado_em timestamptz, link_origem text, raw jsonb
)
on conflict (id) do update set
  orgao = excluded.orgao, unidade = excluded.unidade, uf = excluded.uf, municipio = excluded.municipio,
  objeto = excluded.objeto, info_complementar = excluded.info_complementar, modalidade = excluded.modalidade,
  situacao = excluded.situacao, valor_estimado = excluded.valor_estimado, srp = excluded.srp,
  abertura = excluded.abertura, encerramento = excluded.encerramento, atualizado_em = excluded.atualizado_em,
  link_origem = excluded.link_origem, raw = excluded.raw
where editais.atualizado_em is distinct from excluded.atualizado_em
returning (xmax = 0) as inserido`;

export async function upsertContratacoes(db: Pool, items: PncpContratacao[]) {
  if (items.length === 0) return { inseridos: 0, atualizados: 0 };
  // The API occasionally repeats a record across pages; ON CONFLICT can't touch the same row twice.
  const unique = [...new Map(items.map((c) => [c.numeroControlePNCP, c])).values()];
  const rows = unique.map((c) => ({ ...normalize(c), raw: c }));
  const res = await db.query<{ inserido: boolean }>(UPSERT, [JSON.stringify(rows)]);
  const inseridos = res.rows.filter((r) => r.inserido).length;
  return { inseridos, atualizados: res.rows.length - inseridos };
}

export interface IngestLog {
  (msg: string): void;
}

export interface IngestResult {
  dia: string;
  registros: number;
  inseridos: number;
  atualizados: number;
}

/** Ingests every contratação published on `dia` (YYYY-MM-DD). Safe to re-run: upserts by numeroControlePNCP. */
export async function ingestDia(
  db: Pool,
  dia: string,
  { modalidades = MODALIDADES_INGERIDAS, log = () => {}, fetchOpts }: { modalidades?: number[]; log?: IngestLog; fetchOpts?: FetchOpts } = {},
): Promise<IngestResult> {
  const total: IngestResult = { dia, registros: 0, inseridos: 0, atualizados: 0 };
  for (const modalidade of modalidades) {
    let pagina = 1;
    let paginas = 0;
    let registros = 0;
    for (;;) {
      const page = await fetchPublicacoes(dia, modalidade, pagina, { minIntervalMs: 700, ...fetchOpts });
      if (!page || page.empty || page.data.length === 0) break;
      const r = await upsertContratacoes(db, page.data);
      registros += page.data.length;
      total.inseridos += r.inseridos;
      total.atualizados += r.atualizados;
      paginas = page.totalPaginas;
      if (page.paginasRestantes <= 0 || pagina >= page.totalPaginas) break;
      pagina++;
    }
    total.registros += registros;
    await db.query(
      `insert into ingest_runs (dia, modalidade_id, paginas, registros) values ($1, $2, $3, $4)
       on conflict (dia, modalidade_id) do update set paginas = $3, registros = $4, finalizado_em = now()`,
      [dia, modalidade, paginas, registros],
    );
    log(`${dia} modalidade ${modalidade}: ${registros} registros em ${paginas} páginas`);
  }
  return total;
}

const UPSERT_CONTRATOS = `
insert into contratos (
  id, compra_id, orgao_cnpj, orgao, esfera, uf, municipio, fornecedor_ni, fornecedor, tipo_pessoa, objeto, categoria,
  tipo_contrato, valor_global, data_assinatura, vigencia_inicio, vigencia_fim, publicado_em, atualizado_em, raw
)
select r.id, r.compra_id, r.orgao_cnpj, r.orgao, r.esfera, r.uf, r.municipio, r.fornecedor_ni, r.fornecedor, r.tipo_pessoa,
       r.objeto, r.categoria, r.tipo_contrato, r.valor_global, r.data_assinatura, r.vigencia_inicio, r.vigencia_fim,
       r.publicado_em, r.atualizado_em, r.raw
from jsonb_to_recordset($1::jsonb) as r(
  id text, compra_id text, orgao_cnpj text, orgao text, esfera text, uf text, municipio text, fornecedor_ni text,
  fornecedor text, tipo_pessoa text, objeto text, categoria text, tipo_contrato text, valor_global numeric,
  data_assinatura date, vigencia_inicio date, vigencia_fim date, publicado_em timestamptz, atualizado_em timestamptz, raw jsonb
)
on conflict (id) do update set
  compra_id = excluded.compra_id, fornecedor_ni = excluded.fornecedor_ni, fornecedor = excluded.fornecedor,
  objeto = excluded.objeto, categoria = excluded.categoria, tipo_contrato = excluded.tipo_contrato,
  valor_global = excluded.valor_global, data_assinatura = excluded.data_assinatura,
  vigencia_inicio = excluded.vigencia_inicio, vigencia_fim = excluded.vigencia_fim,
  atualizado_em = excluded.atualizado_em, raw = excluded.raw
where contratos.atualizado_em is distinct from excluded.atualizado_em
returning (xmax = 0) as inserido`;

/** Drops CPFs and names of individuals from the raw payload too, not just from the columns. */
export function sanitizeContrato(c: PncpContrato): PncpContrato {
  const s: Record<string, unknown> = { ...c };
  if (c.tipoPessoa === "PF") Object.assign(s, { niFornecedor: null, nomeRazaoSocialFornecedor: null });
  if (s.tipoPessoaSubContratada === "PF") Object.assign(s, { niFornecedorSubContratado: null, nomeFornecedorSubContratado: null });
  return s as unknown as PncpContrato;
}

export async function upsertContratos(db: Pool, items: PncpContrato[]) {
  if (items.length === 0) return { inseridos: 0, atualizados: 0 };
  const unique = [...new Map(items.map((c) => [c.numeroControlePNCP, c])).values()];
  const rows = unique.map((c) => ({ ...normalizeContrato(c), raw: sanitizeContrato(c) }));
  const res = await db.query<{ inserido: boolean }>(UPSERT_CONTRATOS, [JSON.stringify(rows)]);
  const inseridos = res.rows.filter((r) => r.inserido).length;
  return { inseridos, atualizados: res.rows.length - inseridos };
}

/** Ingests every contract published on `dia`. Idempotent, like ingestDia. */
export async function ingestContratosDia(
  db: Pool,
  dia: string,
  { log = () => {}, fetchOpts }: { log?: IngestLog; fetchOpts?: FetchOpts } = {},
): Promise<IngestResult> {
  const total: IngestResult = { dia, registros: 0, inseridos: 0, atualizados: 0 };
  let pagina = 1;
  let paginas = 0;
  for (;;) {
    const page = await fetchContratos(dia, pagina, { minIntervalMs: 700, ...fetchOpts });
    if (!page || page.empty || page.data.length === 0) break;
    const r = await upsertContratos(db, page.data);
    total.registros += page.data.length;
    total.inseridos += r.inseridos;
    total.atualizados += r.atualizados;
    paginas = page.totalPaginas;
    if (page.paginasRestantes <= 0 || pagina >= page.totalPaginas) break;
    pagina++;
  }
  await db.query(
    `insert into contratos_runs (dia, paginas, registros) values ($1, $2, $3)
     on conflict (dia) do update set paginas = $2, registros = $3, finalizado_em = now()`,
    [dia, paginas, total.registros],
  );
  log(`${dia} contratos: ${total.registros} registros em ${paginas} páginas`);
  return total;
}

/** Days from `from` to `to` inclusive, as YYYY-MM-DD. */
export function dias(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Today's date in Brasília as YYYY-MM-DD, shifted by `offset` days. */
export function hojeBR(offset = 0, now = new Date()): string {
  const br = new Date(now.getTime() - 3 * 3600_000);
  br.setUTCDate(br.getUTCDate() + offset);
  return br.toISOString().slice(0, 10);
}
