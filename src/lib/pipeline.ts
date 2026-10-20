import type { Pool } from "pg";
import type { Resumo } from "./summary";

export const ETAPAS = [
  { id: "triagem", label: "Triagem", cor: "var(--subtle)" },
  { id: "analise", label: "Em análise", cor: "var(--info)" },
  { id: "preparando", label: "Preparando proposta", cor: "var(--warn)" },
  { id: "enviada", label: "Proposta enviada", cor: "var(--accent)" },
  { id: "ganha", label: "Ganha", cor: "var(--ok)" },
  { id: "perdida", label: "Perdida", cor: "var(--danger)" },
  { id: "descartada", label: "Descartada", cor: "var(--border-strong)" },
] as const;

export type Etapa = (typeof ETAPAS)[number]["id"];
export const ETAPA_IDS = new Set<string>(ETAPAS.map((e) => e.id));
export const etapaLabel = (id: string) => ETAPAS.find((e) => e.id === id)?.label ?? id;
/** Stages where a deadline still matters. */
export const ETAPAS_ATIVAS: Etapa[] = ["triagem", "analise", "preparando"];

export interface PipelineItem {
  edital_id: string;
  etapa: Etapa;
  posicao: number;
  valor_proposta: number | null;
  objeto: string;
  orgao: string;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  valor_estimado: number | null;
  encerramento: Date | null;
  abertura: Date | null;
  check_total: number;
  check_feito: number;
}

/** Active cards whose proposals close within `dias`, soonest first. */
export function vencendo(itens: PipelineItem[], dias = 7, now = Date.now()): PipelineItem[] {
  return itens
    .filter((i) => {
      if (!ETAPAS_ATIVAS.includes(i.etapa) || !i.encerramento) return false;
      const ms = new Date(i.encerramento).getTime() - now;
      return ms > 0 && ms < dias * 86_400_000;
    })
    .sort((a, b) => new Date(a.encerramento!).getTime() - new Date(b.encerramento!).getTime());
}

export async function listPipeline(db: Pool, userId: number): Promise<PipelineItem[]> {
  const { rows } = await db.query<PipelineItem>(
    `select p.edital_id, p.etapa, p.posicao, p.valor_proposta::float8 as valor_proposta,
            e.objeto, e.orgao, e.uf, e.municipio, e.modalidade, e.valor_estimado::float8 as valor_estimado,
            e.encerramento, e.abertura,
            (select count(*)::int from pipeline_checklist c where c.user_id = p.user_id and c.edital_id = p.edital_id) as check_total,
            (select count(*)::int from pipeline_checklist c where c.user_id = p.user_id and c.edital_id = p.edital_id and c.feito) as check_feito
     from pipeline p join editais e on e.id = p.edital_id
     where p.user_id = $1
     order by p.posicao, e.encerramento nulls last`,
    [userId],
  );
  return rows;
}

/** Adds an edital at the end of a stage. Seeds the checklist from a cached AI summary when there is one. */
export async function addToPipeline(db: Pool, userId: number, editalId: string, etapa: Etapa = "triagem") {
  const { rowCount } = await db.query(
    `insert into pipeline (user_id, edital_id, etapa, posicao)
     select $1, $2, $3, coalesce(max(posicao) + 1, 0) from pipeline where user_id = $1 and etapa = $3
     on conflict (user_id, edital_id) do nothing`,
    [userId, editalId, etapa],
  );
  if (rowCount) await seedChecklist(db, userId, editalId);
}

export async function seedChecklist(db: Pool, userId: number, editalId: string) {
  const { rows } = await db.query<{ dados: Resumo }>(`select dados from resumos where edital_id = $1`, [editalId]);
  const itens = rows[0]?.dados.exigencias_habilitacao ?? [];
  if (!itens.length) return 0;
  // Only fills an empty checklist, so re-running never duplicates items.
  const res = await db.query(
    `insert into pipeline_checklist (user_id, edital_id, texto, ordem)
     select $1, $2, t.texto, t.ordem from unnest($3::text[]) with ordinality as t(texto, ordem)
     where not exists (select 1 from pipeline_checklist where user_id = $1 and edital_id = $2)`,
    [userId, editalId, itens.map((i) => i.slice(0, 500))],
  );
  return res.rowCount ?? 0;
}

/** Puts `editalId` in `etapa` and renumbers that column in the order the client sent. */
export async function moveCard(db: Pool, userId: number, editalId: string, etapa: Etapa, ordem: string[]) {
  const ids = ordem.includes(editalId) ? ordem : [...ordem, editalId];
  await db.query(`update pipeline set etapa = $3, atualizado_em = now() where user_id = $1 and edital_id = $2`, [userId, editalId, etapa]);
  await db.query(
    `update pipeline p set posicao = t.i
     from unnest($2::text[]) with ordinality as t(id, i)
     where p.user_id = $1 and p.edital_id = t.id and p.etapa = $3`,
    [userId, ids, etapa],
  );
}

export interface CardDetalhe {
  checklist: { id: number; texto: string; feito: boolean }[];
  notas: { id: number; texto: string; criado_em: Date }[];
}

export async function cardDetalhe(db: Pool, userId: number, editalId: string): Promise<CardDetalhe> {
  const [c, n] = await Promise.all([
    db.query(`select id, texto, feito from pipeline_checklist where user_id = $1 and edital_id = $2 order by ordem, id`, [userId, editalId]),
    db.query(`select id, texto, criado_em from pipeline_notas where user_id = $1 and edital_id = $2 order by criado_em desc`, [userId, editalId]),
  ]);
  return { checklist: c.rows, notas: n.rows };
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 folding: at most 75 octets per line, continuation lines start with a space. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** iCalendar feed with one event per proposal deadline. */
export function renderIcs(appUrl: string, itens: Pick<PipelineItem, "edital_id" | "objeto" | "orgao" | "encerramento" | "etapa">[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar de Licitacoes//PT-BR", "X-WR-CALNAME:Radar · prazos de propostas", "CALSCALE:GREGORIAN"];
  for (const i of itens) {
    if (!i.encerramento) continue;
    const end = new Date(i.encerramento);
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(i.edital_id)}@radar-licitacoes`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      fold(`SUMMARY:${icsEscape(`Prazo: ${i.objeto.slice(0, 120)}`)}`),
      fold(`DESCRIPTION:${icsEscape(`${i.orgao}\nEtapa: ${etapaLabel(i.etapa)}\n${appUrl}/edital/${encodeURIComponent(i.edital_id)}`)}`),
      fold(`URL:${appUrl}/edital/${encodeURIComponent(i.edital_id)}`),
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:Prazo de proposta amanhã",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
