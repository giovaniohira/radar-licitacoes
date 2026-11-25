import type { Pool } from "pg";
import { escapeHtml } from "./mail";
import { formatBRL, frase, local, nome, tituloCurto } from "./format";
import type { Consulta } from "./recompra";

/**
 * "Acompanhar concorrente": the user follows companies by CNPJ; the contracts those companies sign come in the 7h e-mail.
 * Only companies (14-digit CNPJ, the only supplier id the database keeps) and only the `contratos` table.
 */
export const MAX_CONCORRENTES = 20;
/** Where a visitor without an account who clicked "Acompanhar" is remembered until the account exists (see /seguir/retorno). */
export const COOKIE_SEGUIR = "seguir";
export const MAX_NO_EMAIL = 10;
/** A contract published longer ago than this is no news. A company followed just now brings the last week as context. */
export const DIAS_DE_NOVIDADE = 7;

export interface Seguido {
  fornecedor_ni: string;
  nome: string | null;
  criado_em: Date;
}

export interface ContratoDoConcorrente {
  id: string;
  fornecedor: string | null;
  fornecedor_ni: string;
  objeto: string;
  orgao: string;
  orgao_cnpj: string;
  municipio: string | null;
  uf: string | null;
  valor_global: number | null;
}

export interface Concorrentes {
  itens: ContratoDoConcorrente[];
  /** Contracts that did not fit in the e-mail (they count as seen). */
  alemDoLimite: number;
}

export const apenasDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const ehCnpj = (ni: string) => /^\d{14}$/.test(ni);

/** Starts following a company. Returns an error message for the user, or null. Following twice is harmless. */
export async function seguirConcorrente(db: Pool, userId: number, ni: string): Promise<string | null> {
  if (!ehCnpj(ni)) return "Só acompanhamos empresas, pelo CNPJ.";
  const { rows } = await db.query<{ nome: string }>(`select max(fornecedor) as nome from contratos where fornecedor_ni = $1 having count(*) > 0`, [ni]);
  if (!rows[0]) return "Não achamos contratos dessa empresa no PNCP.";
  const { rows: ja } = await db.query(`select 1 from concorrentes where user_id = $1 and fornecedor_ni = $2`, [userId, ni]);
  if (ja.length) return null;
  const { rows: total } = await db.query<{ n: number }>(`select count(*)::int as n from concorrentes where user_id = $1`, [userId]);
  if (total[0].n >= MAX_CONCORRENTES) return `Você já acompanha ${MAX_CONCORRENTES} concorrentes. Pare de acompanhar um para incluir outro.`;
  await db.query(`insert into concorrentes (user_id, fornecedor_ni, nome) values ($1, $2, $3) on conflict do nothing`, [userId, ni, rows[0].nome]);
  return null;
}

export async function pararDeSeguir(db: Pool, userId: number, ni: string): Promise<void> {
  await db.query(`delete from concorrentes where user_id = $1 and fornecedor_ni = $2`, [userId, apenasDigitos(ni)]);
}

export async function estaSeguindo(db: Pool, userId: number, ni: string): Promise<boolean> {
  return (await db.query(`select 1 from concorrentes where user_id = $1 and fornecedor_ni = $2`, [userId, ni])).rows.length > 0;
}

export async function listarSeguidos(db: Pool, userId: number): Promise<Seguido[]> {
  return (await db.query<Seguido>(`select fornecedor_ni, nome, criado_em from concorrentes where user_id = $1 order by criado_em, fornecedor_ni`, [userId])).rows;
}

/** The users that follow someone: who may get an e-mail with only this section. */
export async function usuariosQueSeguem(db: Pool): Promise<{ id: number; email: string }[]> {
  return (await db.query<{ id: number; email: string }>(`select distinct u.id, u.email from concorrentes k join users u on u.id = k.user_id order by u.id`)).rows;
}

const NOVOS = `from concorrentes k join contratos c on c.fornecedor_ni = k.fornecedor_ni
  where k.user_id = $1
    and c.publicado_em >= now() - make_interval(days => ${DIAS_DE_NOVIDADE})
    and not exists (select 1 from concorrente_envios e where e.user_id = k.user_id and e.contrato_id = c.id)`;

/** The new contracts of the companies the user follows, newest first: `limite` of them and how many more there are. */
export async function contratosDosConcorrentes(db: Consulta, userId: number, limite = MAX_NO_EMAIL): Promise<Concorrentes> {
  const { rows } = await db.query<ContratoDoConcorrente & { total: number }>(
    `select c.id, c.fornecedor, c.fornecedor_ni, c.objeto, c.orgao, c.orgao_cnpj, c.municipio, c.uf, c.valor_global::float8 as valor_global,
            count(*) over ()::int as total
     ${NOVOS}
     order by c.publicado_em desc, c.id
     limit $2`,
    [userId, limite],
  );
  return { itens: rows.map((r) => ({ id: r.id, fornecedor: r.fornecedor, fornecedor_ni: r.fornecedor_ni, objeto: r.objeto, orgao: r.orgao, orgao_cnpj: r.orgao_cnpj, municipio: r.municipio, uf: r.uf, valor_global: r.valor_global })), alemDoLimite: rows.length ? Math.max(0, rows[0].total - rows.length) : 0 };
}

/**
 * Called only after the e-mail went out: every new contract seen by now (the ones listed and the ones that did not fit)
 * never shows to this user again.
 */
export async function marcarVistos(db: Consulta, userId: number): Promise<void> {
  await db.query(`insert into concorrente_envios (user_id, contrato_id) select $1, c.id ${NOVOS} on conflict do nothing`, [userId]);
}

export const vazio = (c: Concorrentes | null | undefined) => !c || c.itens.length === 0;

export const TITULO_DA_SECAO = "Seus concorrentes";

const valorDoContrato = (v: number | null) => (v && v > 0 ? formatBRL(v) : null);

/** "{Fornecedor} assinou contrato com {órgão}, {cidade-UF}: {objeto curto}, {valor}". */
export function partesDoContrato(c: ContratoDoConcorrente) {
  return {
    quem: nome(c.fornecedor) || "Fornecedor",
    resto: ` assinou contrato com ${nome(c.orgao)}, ${local(c.municipio, c.uf, c.orgao) || "—"}: ${tituloCurto(frase(c.objeto), 90)}${valorDoContrato(c.valor_global) ? `, ${valorDoContrato(c.valor_global)}` : ""}`,
  };
}

export const linhaDeResumo = (n: number) => `e mais ${n} ${n === 1 ? "contrato" : "contratos"} dos seus concorrentes`;

export function textoDaSecao(appUrl: string, c: Concorrentes): string {
  return [
    `\n${TITULO_DA_SECAO}`,
    ...c.itens.map((x) => {
      const p = partesDoContrato(x);
      return `- ${p.quem}${p.resto}\n  ${appUrl}/fornecedor/${x.fornecedor_ni}`;
    }),
    ...(c.alemDoLimite ? [`- ${linhaDeResumo(c.alemDoLimite)}: ${appUrl}/alertas`] : []),
  ].join("\n");
}

export function htmlDaSecao(appUrl: string, c: Concorrentes, cores: { text: string; muted: string; border: string }): string {
  const itens = c.itens
    .map((x) => {
      const p = partesDoContrato(x);
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${cores.border};font-size:14px;line-height:20px;color:${cores.text}">
<b>${escapeHtml(p.quem)}</b>${escapeHtml(p.resto)}
<div><a href="${appUrl}/fornecedor/${x.fornecedor_ni}" style="display:inline-block;padding:8px 0;color:${cores.text};font-size:13px;font-weight:600;text-decoration:underline">Ver fornecedor</a></div>
</td></tr>`;
    })
    .join("");
  const mais = c.alemDoLimite
    ? `<tr><td style="padding:12px 0;font-size:13px;color:${cores.muted}">${escapeHtml(linhaDeResumo(c.alemDoLimite))}. <a href="${appUrl}/alertas" style="color:${cores.muted};text-decoration:underline">Ver quem você acompanha</a></td></tr>`
    : "";
  return `<tr><td style="padding:16px 24px 0">
<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${cores.muted}">${escapeHtml(TITULO_DA_SECAO)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itens}${mais}</table>
</td></tr>`;
}

