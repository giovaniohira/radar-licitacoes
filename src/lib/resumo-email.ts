import type { Pool } from "pg";
import type { EditalRow } from "./pncp";
import { gerarResumo, type Resumo } from "./summary";

/**
 * The AI summary inside the 7h e-mail: the three open editais with the nearest deadline that still leaves time to
 * bid get a short block. The 06h job writes the summaries (shared cache by edital, so one that already exists costs
 * nothing); the 7h send only reads them. Summaries made here never count against a user's daily quota: they count
 * against one global daily cap instead (resumo_job_uso).
 */
export const EDITAIS_COM_RESUMO = 3;
export const DIAS_MINIMOS = 3;

/** Global cap of new summaries per day for the job. 0 turns the feature off. */
export const tetoDiario = () => {
  const n = Number(process.env.RESUMO_EMAIL_TETO_DIARIO ?? 100);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
};

/** The editais of one e-mail that get a summary block: deadline at least 3 days away, nearest first, at most three. */
export function escolherParaResumo<T extends { id: string; encerramento: Date | string | null }>(editais: T[], now = new Date(), n = EDITAIS_COM_RESUMO): T[] {
  const minimo = now.getTime() + DIAS_MINIMOS * 86_400_000;
  const vistos = new Set<string>();
  return editais
    .filter((e) => e.encerramento && new Date(e.encerramento).getTime() >= minimo && !vistos.has(e.id) && !!vistos.add(e.id))
    .sort((a, b) => new Date(a.encerramento!).getTime() - new Date(b.encerramento!).getTime())
    .slice(0, n);
}

export interface BlocoResumo {
  objeto: string;
  prazo: string | null;
  meEpp: string;
  atencao: string[];
}

const curto = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** The first sentence, so the block stays one line of what is being bought. */
const primeiraFrase = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  const fim = t.search(/[.!?](\s|$)/);
  return curto(fim > 20 ? t.slice(0, fim + 1) : t, max);
};

/** What the e-mail shows from a full summary: object, main deadline, ME/EPP, at most two attention points. */
export function blocoDoResumo(r: Resumo): BlocoResumo {
  const prazos = r.prazos ?? [];
  const principal = prazos.find((p) => /proposta/i.test(p.evento)) ?? prazos.find((p) => /sess[aã]o|abertura|disputa/i.test(p.evento)) ?? prazos[0];
  return {
    objeto: primeiraFrase(r.objeto, 220),
    prazo: principal ? `${curto(principal.evento, 60)}: ${curto(principal.data, 40)}` : null,
    meEpp: r.exclusivo_me_epp ? "Exclusivo ME/EPP" : "Ampla concorrência",
    atencao: (r.pontos_de_atencao ?? []).filter((x) => x.trim()).slice(0, 2).map((x) => curto(x, 170)),
  };
}

/** Takes one slot of today's global cap; false when the cap is reached (the slot is given back). */
export async function reservarVaga(db: Pool, teto = tetoDiario()): Promise<boolean> {
  if (teto <= 0) return false;
  const { rows } = await db.query<{ total: number }>(
    `insert into resumo_job_uso (dia, total) values (current_date, 1)
     on conflict (dia) do update set total = resumo_job_uso.total + 1
     returning total`,
  );
  if (rows[0].total > teto) {
    await liberarVaga(db);
    return false;
  }
  return true;
}

export const liberarVaga = (db: Pool) => db.query(`update resumo_job_uso set total = greatest(total - 1, 0) where dia = current_date`);

type Gerar = typeof gerarResumo;

/**
 * The summary of an edital for the e-mail: the cached one, or a new one while the daily cap allows.
 * Returns null (never throws) when it cannot be had: cap reached, no PDF, ZIP or too large, Claude down.
 */
export async function resumoParaEmail(db: Pool, edital: EditalRow, { teto = tetoDiario(), gerar = gerarResumo }: { teto?: number; gerar?: Gerar } = {}): Promise<Resumo | null> {
  const cached = await db.query<{ dados: Resumo }>(`select dados from resumos where edital_id = $1`, [edital.id]);
  if (cached.rows[0]) return cached.rows[0].dados;
  if (!(await reservarVaga(db, teto))) return null;
  try {
    return (await gerar(db, edital)).dados;
  } catch (err) {
    await liberarVaga(db);
    console.error(`resumo do e-mail: edital ${edital.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Cached summaries for these editais, by id. */
export async function resumosDoCache(db: Pool, ids: string[]): Promise<Map<string, Resumo>> {
  if (!ids.length) return new Map();
  const { rows } = await db.query<{ edital_id: string; dados: Resumo }>(`select edital_id, dados from resumos where edital_id = any($1::text[])`, [ids]);
  return new Map(rows.map((r) => [r.edital_id, r.dados]));
}
