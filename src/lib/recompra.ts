import type { Pool } from "pg";
import { escapeHtml } from "./mail";
import { formatBRL, formatDia, frase, local, nome, tituloCurto } from "./format";
import { toWebsearch } from "./search";

/**
 * "Radar de recompra": contracts that end soon, found from the words, UFs and value range of the user's own alerts.
 * The buyer will have to buy the same thing again, so the user can get ready before the edital is out.
 */
/** A pool or one of its clients. */
export type Consulta = Pick<Pool, "query">;

export const JANELA_DIAS = { de: 30, ate: 90 };
/** Lines in one e-mail, besides the "your own contract" lines. */
export const MAX_NO_EMAIL = 5;
/** Own contracts are rare; two lines are plenty. */
export const MAX_PROPRIOS = 2;

export interface Contrato {
  id: string;
  objeto: string;
  orgao: string;
  orgao_cnpj: string;
  municipio: string | null;
  uf: string | null;
  fornecedor: string | null;
  fornecedor_ni: string | null;
  valor_global: number | null;
  /** "YYYY-MM-DD" */
  vigencia_fim: string;
}

export interface DosAlertas {
  palavras: string;
  ufs: string[];
  valor_min: string | null;
  valor_max: string | null;
}

export interface Recompras {
  itens: Contrato[];
  /** The user is the supplier. Only for an account with a CNPJ. */
  proprios: Contrato[];
}

const COLUNAS = `c.id, c.objeto, c.orgao, c.orgao_cnpj, c.municipio, c.uf, c.fornecedor, c.fornecedor_ni,
  c.valor_global::float8 as valor_global, c.vigencia_fim`;
const JANELA = `c.vigencia_fim between $1::date + ${JANELA_DIAS.de} and $1::date + ${JANELA_DIAS.ate}`;
const AINDA_NAO_ENVIADO = `not exists (select 1 from recompra_envios r where r.user_id = $2 and r.contrato_id = c.id)`;
const UF_RE = /^[A-Z]{2}$/;

/**
 * The contracts to show one user: for each alert that has words (an alert with no words would match every contract),
 * the ones that end inside the window, in the alert's UFs and value range, not shown to this user before and not
 * held by the user's own company. At most `limite`, the ones that end first.
 * Individuals (tipo_pessoa PF) never come out: they are anonymous in the ingestion and not a market to bid for.
 */
export async function recomprasDoUsuario(
  db: Consulta,
  userId: number,
  alerts: DosAlertas[],
  hoje: string,
  { cnpj = null, limite = MAX_NO_EMAIL }: { cnpj?: string | null; limite?: number } = {},
): Promise<Recompras> {
  const achados = new Map<string, Contrato>();
  for (const a of alerts) {
    const q = toWebsearch(a.palavras ?? "");
    if (!q) continue;
    const ufs = (a.ufs ?? []).map((u) => u.toUpperCase()).filter((u) => UF_RE.test(u));
    const { rows } = await db.query<Contrato>(
      `select ${COLUNAS} from contratos c
       where ${JANELA}
         and c.tipo_pessoa is distinct from 'PF'
         and c.busca @@ websearch_to_tsquery('portuguese', f_unaccent($3))
         and (cardinality($4::text[]) = 0 or c.uf = any($4::text[]))
         and ($5::numeric is null or c.valor_global >= $5::numeric)
         and ($6::numeric is null or c.valor_global <= $6::numeric)
         and ($7::text is null or c.fornecedor_ni is distinct from $7::text)
         and ${AINDA_NAO_ENVIADO}
       order by c.vigencia_fim, c.valor_global desc nulls last, c.id
       limit $8`,
      [hoje, userId, q, ufs, a.valor_min, a.valor_max, cnpj, limite],
    );
    for (const c of rows) achados.set(c.id, c);
  }
  const itens = [...achados.values()]
    .sort((a, b) => a.vigencia_fim.localeCompare(b.vigencia_fim) || (b.valor_global ?? 0) - (a.valor_global ?? 0) || a.id.localeCompare(b.id))
    .slice(0, limite);

  let proprios: Contrato[] = [];
  if (cnpj) {
    proprios = (
      await db.query<Contrato>(
        `select ${COLUNAS} from contratos c
         where ${JANELA} and c.fornecedor_ni = $3::text and ${AINDA_NAO_ENVIADO}
         order by c.vigencia_fim, c.id
         limit ${MAX_PROPRIOS}`,
        [hoje, userId, cnpj],
      )
    ).rows;
  }
  return { itens, proprios };
}

/** Called only after the e-mail went out: those contracts never show to this user again. */
export async function marcarEnviadas(db: Consulta, userId: number, r: Recompras): Promise<void> {
  for (const [lista, proprio] of [
    [r.itens, false],
    [r.proprios, true],
  ] as const) {
    if (!lista.length) continue;
    await db.query(
      `insert into recompra_envios (user_id, contrato_id, proprio) select $1, unnest($2::text[]), $3 on conflict do nothing`,
      [userId, lista.map((c) => c.id), proprio],
    );
  }
}

/** What the /painel card lists: what the last 30 days of e-mails carried and whose contract has not ended yet. */
export async function recomprasEnviadas(db: Consulta, userId: number, hoje: string, limite = MAX_NO_EMAIL): Promise<Contrato[]> {
  return (
    await db.query<Contrato>(
      `select ${COLUNAS} from recompra_envios r join contratos c on c.id = r.contrato_id
       where r.user_id = $1 and not r.proprio and r.enviado_em > now() - interval '30 days' and c.vigencia_fim >= $2::date
       order by c.vigencia_fim, c.id
       limit $3`,
      [userId, hoje, limite],
    )
  ).rows;
}

export const vazio = (r: Recompras | null | undefined) => !r || (r.itens.length === 0 && r.proprios.length === 0);

export const TITULO_DA_SECAO = "Contratos do seu ramo que terminam em 30 a 90 dias";
export const AVISO_DA_SECAO = "Contrato que termina pode ser prorrogado, e nem sempre vira edital novo. Confira no PNCP antes de se preparar.";

/** The current supplier, only when it is a company: an individual never appears by name. */
export const fornecedorDe = (c: Pick<Contrato, "fornecedor" | "fornecedor_ni">): string | null =>
  c.fornecedor && c.fornecedor_ni && /^\d{14}$/.test(c.fornecedor_ni) ? nome(c.fornecedor) : null;

export const linhaDoProprio = (c: Contrato) => `Seu contrato com ${nome(c.orgao)} termina em ${formatDia(c.vigencia_fim)}. O órgão pode prorrogar ou abrir novo edital: vale acompanhar.`;

/** The three lines of an item: what, who buys, who has it now and until when. */
export function partesDoItem(c: Contrato) {
  const forn = fornecedorDe(c);
  return {
    objeto: tituloCurto(frase(c.objeto), 110),
    comprador: [nome(c.orgao), local(c.municipio, c.uf, c.orgao)].filter(Boolean).join(" · "),
    detalhe: [forn && `Fornecedor atual: ${forn}`, c.valor_global ? `Contrato de ${formatBRL(c.valor_global)}` : null, `termina em ${formatDia(c.vigencia_fim)}`].filter(Boolean).join(" · "),
  };
}

export function textoDaSecao(appUrl: string, r: Recompras): string {
  return [
    `\n${TITULO_DA_SECAO}`,
    ...r.proprios.map((c) => `- ${linhaDoProprio(c)}\n  ${appUrl}/orgao/${c.orgao_cnpj}`),
    ...r.itens.map((c) => {
      const p = partesDoItem(c);
      return `- ${p.objeto}\n  ${p.comprador}\n  ${p.detalhe}\n  ${appUrl}/orgao/${c.orgao_cnpj}`;
    }),
    AVISO_DA_SECAO,
  ].join("\n");
}

/** Plain table cells and inline styles, like the rest of the digest. `cores` are the digest's own colours. */
export function htmlDaSecao(appUrl: string, r: Recompras, cores: { text: string; muted: string; border: string }): string {
  const link = (c: Contrato, texto: string) =>
    `<a href="${appUrl}/orgao/${encodeURIComponent(c.orgao_cnpj)}" style="display:inline-block;padding:8px 0;color:${cores.text};font-size:13px;font-weight:600;text-decoration:underline">${texto}</a>`;
  const proprios = r.proprios
    .map((c) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${cores.border};font-size:13px;line-height:19px"><b>${escapeHtml(linhaDoProprio(c))}</b></td></tr>`)
    .join("");
  const itens = r.itens
    .map((c) => {
      const p = partesDoItem(c);
      return `<tr><td style="padding:14px 0;border-bottom:1px solid ${cores.border}">
<div style="color:${cores.text};font-weight:600;font-size:14px;line-height:20px">${escapeHtml(p.objeto)}</div>
<div style="font-size:12px;color:${cores.muted};margin-top:4px">${escapeHtml(p.comprador)}</div>
<div style="font-size:13px;margin-top:6px">${escapeHtml(p.detalhe)}</div>
<div>${link(c, "Ver compras do órgão")}</div>
</td></tr>`;
    })
    .join("");
  return `<tr><td style="padding:16px 24px 0">
<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${cores.muted}">${escapeHtml(TITULO_DA_SECAO)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${proprios}${itens}</table>
<p style="font-size:12px;color:${cores.muted};margin:8px 0 0">${escapeHtml(AVISO_DA_SECAO)}</p>
</td></tr>`;
}
