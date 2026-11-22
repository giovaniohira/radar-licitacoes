import type { Pool } from "pg";
import { formatDia } from "./format";

/**
 * "Certidões em dia": the validity date of the certificates a company needs to bid. Dates are plain "YYYY-MM-DD"
 * strings (a certificate is valid through that day, in Brasília time), so no timezone can move a day.
 */
export const TIPOS_FIXOS = [
  {
    id: "federal",
    nome: "Federal (Receita e PGFN)",
    curto: "certidão federal",
    link: "https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal-perante-a-fazenda-nacional",
  },
  { id: "fgts", nome: "FGTS (CRF)", curto: "CRF do FGTS", link: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf" },
  { id: "trabalhista", nome: "Trabalhista (CNDT)", curto: "CNDT", link: "https://cndt-certidao.tst.jus.br/inicio.faces" },
  { id: "estadual", nome: "Estadual", curto: "certidão estadual", link: null },
  { id: "municipal", nome: "Municipal", curto: "certidão municipal", link: null },
] as const;

export type TipoFixo = (typeof TIPOS_FIXOS)[number]["id"];
export const MAX_OUTRAS = 20;
/** Days before the expiry (and the day itself) on which the e-mail warns. */
export const DIAS_DE_AVISO = [7, 3, 1, 0];

export interface Certidao {
  id: number;
  tipo: string;
  nome: string | null;
  valida_ate: string;
}

/** Today in Brasília, "YYYY-MM-DD". */
export function hojeBR(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Whole days from `hoje` to the validity date: 0 = valid through today, negative = already expired. */
export const diasAte = (validaAte: string, hoje: string) => Math.round(dia(validaAte) - dia(hoje));

export interface EstadoCertidao {
  estado: "vencida" | "hoje" | "vence" | "em_dia";
  dias: number;
  texto: string;
  tom: "danger" | "warn" | "ok";
}

export function estadoDaCertidao(validaAte: string, hoje: string): EstadoCertidao {
  const dias = diasAte(validaAte, hoje);
  if (dias < 0) return { estado: "vencida", dias, texto: dias === -1 ? "vencida ontem" : `vencida há ${-dias} dias`, tom: "danger" };
  if (dias === 0) return { estado: "hoje", dias, texto: "vence hoje", tom: "danger" };
  if (dias <= 7) return { estado: "vence", dias, texto: dias === 1 ? "vence amanhã" : `vence em ${dias} dias`, tom: "warn" };
  return { estado: "em_dia", dias, texto: "em dia", tom: "ok" };
}

export function nomeDaCertidao(c: Pick<Certidao, "tipo" | "nome">): string {
  if (c.tipo === "outra") return c.nome?.trim() || "Outra certidão";
  return TIPOS_FIXOS.find((t) => t.id === c.tipo)?.curto ?? c.tipo;
}

export const linkDaCertidao = (c: Pick<Certidao, "tipo">): string | null => TIPOS_FIXOS.find((t) => t.id === c.tipo)?.link ?? null;

/** The certificates the e-mail warns about today: exactly 7, 3 or 1 days before the expiry, and the day it expires. */
export const certidoesParaAvisar = (cs: Certidao[], hoje: string): Certidao[] => cs.filter((c) => DIAS_DE_AVISO.includes(diasAte(c.valida_ate, hoje)));

/** "Sua CRF do FGTS vence em 3 dias." The e-mail only calls this on the warning days, so it never says "vencida". */
export function textoDoAviso(c: Pick<Certidao, "tipo" | "nome" | "valida_ate">, hoje: string): string {
  const quem = c.tipo === "outra" ? `Sua certidão "${nomeDaCertidao(c)}"` : `Sua ${nomeDaCertidao(c)}`;
  return `${quem} ${estadoDaCertidao(c.valida_ate, hoje).texto}.`;
}

/** The certificates that expire before the session of an edital (the session or, without one, the proposal deadline). */
export function venceAntesDaSessao(cs: Certidao[], sessao: Date | string | null, hoje?: string): Certidao[] {
  if (!sessao) return [];
  const diaDaSessao = hojeBR(new Date(sessao));
  if (hoje && diaDaSessao < hoje) return []; // the session is over, nothing to warn about
  return cs.filter((c) => c.valida_ate < diaDaSessao);
}

export interface EntradaCertidao {
  id?: number;
  tipo: string;
  nome?: string | null;
  validaAte: string;
}

/** An error message for the user, or null when the input is fine. */
export function validarEntrada(e: EntradaCertidao): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.validaAte)) return "Informe a data de validade.";
  const d = new Date(`${e.validaAte}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== e.validaAte) return "Essa data não existe.";
  const ano = +e.validaAte.slice(0, 4);
  if (ano < 2000 || ano > 2100) return "Confira o ano da data.";
  if (e.tipo === "outra") {
    if (!e.id && !(e.nome ?? "").trim()) return "Dê um nome para essa certidão.";
    if ((e.nome ?? "").trim().length > 60) return "O nome pode ter até 60 letras.";
  } else if (!TIPOS_FIXOS.some((t) => t.id === e.tipo)) {
    return "Tipo de certidão inválido.";
  }
  return null;
}

export async function listarCertidoes(db: Pool, userId: number): Promise<Certidao[]> {
  const { rows } = await db.query<Certidao>(
    `select id, tipo, nome, valida_ate::text as valida_ate from certidoes where user_id = $1 order by valida_ate, id`,
    [userId],
  );
  return rows;
}

/** Creates or updates. Returns an error message, or null. */
export async function salvarCertidao(db: Pool, userId: number, e: EntradaCertidao): Promise<string | null> {
  const erro = validarEntrada(e);
  if (erro) return erro;
  if (e.id) {
    const { rowCount } = await db.query(
      `update certidoes set valida_ate = $3, nome = case when tipo = 'outra' and $4::text is not null then $4 else nome end, atualizado_em = now()
       where id = $1 and user_id = $2`,
      [e.id, userId, e.validaAte, e.tipo === "outra" ? (e.nome ?? "").trim() || null : null],
    );
    return rowCount ? null : "Certidão não encontrada.";
  }
  if (e.tipo === "outra") {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from certidoes where user_id = $1 and tipo = 'outra'`, [userId]);
    if (rows[0].n >= MAX_OUTRAS) return `Limite de ${MAX_OUTRAS} outras certidões.`;
    await db.query(`insert into certidoes (user_id, tipo, nome, valida_ate) values ($1, 'outra', $2, $3)`, [userId, (e.nome ?? "").trim(), e.validaAte]);
    return null;
  }
  await db.query(
    `insert into certidoes (user_id, tipo, valida_ate) values ($1, $2, $3)
     on conflict (user_id, tipo) where tipo <> 'outra' do update set valida_ate = excluded.valida_ate, atualizado_em = now()`,
    [userId, e.tipo, e.validaAte],
  );
  return null;
}

export async function apagarCertidao(db: Pool, userId: number, id: number): Promise<void> {
  await db.query(`delete from certidoes where id = $1 and user_id = $2`, [id, userId]);
}

export interface AvisoDoUsuario {
  email: string;
  certidoes: Certidao[];
}

/** Certificates to warn about today, by e-mail address, leaving out the ones already warned today. */
export async function avisosPendentes(db: Pool, hoje: string): Promise<AvisoDoUsuario[]> {
  const { rows } = await db.query<Certidao & { email: string }>(
    `select c.id, c.tipo, c.nome, c.valida_ate::text as valida_ate, u.email
     from certidoes c join users u on u.id = c.user_id
     where (c.valida_ate - $1::date) = any($2::int[])
       and not exists (select 1 from certidao_avisos a where a.certidao_id = c.id and a.dia = $1::date)
     order by u.email, c.valida_ate, c.id`,
    [hoje, DIAS_DE_AVISO],
  );
  const porEmail = new Map<string, Certidao[]>();
  for (const { email, ...c } of rows) porEmail.set(email, [...(porEmail.get(email) ?? []), c]);
  return [...porEmail].map(([email, certidoes]) => ({ email, certidoes }));
}

/** Called after the e-mail went out, so a second run the same day does not repeat it. */
export async function marcarAvisadas(db: Pool, ids: number[], hoje: string): Promise<void> {
  if (!ids.length) return;
  await db.query(`insert into certidao_avisos (certidao_id, dia) select unnest($1::int[]), $2::date on conflict do nothing`, [ids, hoje]);
}

export interface Selo {
  certidoes: Certidao[];
  /** The date compared with the expiry: the later of the opening and the deadline. */
  ate: Date | string;
}

/** The stages in which a card still has a session ahead (everything but the finished ones). */
const ETAPAS_COM_SESSAO_PENDENTE = ["triagem", "analise", "preparando", "enviada"];

/**
 * For each active pipeline card, the certificates that expire before its session ("Certidão vence antes da sessão").
 * In the PNCP "abertura" is when proposals START being received and "encerramento" is the deadline; the session and the
 * check of the documents come at or after the deadline, so the later of the two dates is the one that matters.
 * Cards with nothing to warn about are left out.
 */
export function selosDoPipeline(
  itens: { edital_id: string; etapa: string; abertura: Date | string | null; encerramento: Date | string | null }[],
  cs: Certidao[],
  hoje: string,
): Map<string, Selo> {
  const out = new Map<string, Selo>();
  if (!cs.length) return out;
  for (const i of itens) {
    if (!ETAPAS_COM_SESSAO_PENDENTE.includes(i.etapa)) continue;
    const datas = [i.abertura, i.encerramento].filter((d): d is Date | string => !!d);
    if (!datas.length) continue;
    const sessao = datas.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
    const vencem = venceAntesDaSessao(cs, sessao, hoje);
    if (vencem.length) out.set(i.edital_id, { certidoes: vencem, ate: sessao });
  }
  return out;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The text on the card itself (phones have no hover): which certificate, or how many. */
export const rotuloDoSelo = (cs: Certidao[]) =>
  cs.length === 1 ? `${maiuscula(nomeDaCertidao(cs[0]))} vence antes da sessão` : `${cs.length} certidões vencem antes da sessão`;

/**
 * The hover text: the dates we compared, so the user can check them. "Propostas até" is the later of the opening and the
 * deadline (see selosDoPipeline); we do not claim a session date we do not have.
 */
export const textoDoSelo = (cs: Certidao[], ate: Date | string) =>
  `${cs.map((c) => `${maiuscula(nomeDaCertidao(c))} vence em ${dm(c.valida_ate)}`).join("; ")}. Propostas até ${formatDia(ate).slice(0, 5)}.`;

/** The Hoje card: "2 disputas com certidão que vence antes da sessão". */
export const ROTULO_DO_SELO = "com certidão que vence antes da sessão";
