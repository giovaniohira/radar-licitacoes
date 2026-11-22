import type { Pool } from "pg";
import { avisosPendentes, certidoesParaAvisar, hojeBR as hojeDasCertidoes, linkDaCertidao, marcarAvisadas, textoDoAviso, type Certidao } from "./certidoes";
import { escapeHtml, sendMail, type Mail } from "./mail";
import { EMPRESA } from "./empresa";
import { formatBRL, formatData, frase, local, nome, prazo } from "./format";
import type { EditalRow } from "./pncp";
import { htmlDaSecao, marcarEnviadas, recomprasDoUsuario, textoDaSecao, vazio, type Recompras } from "./recompra";
import { blocoDoResumo, escolherParaResumo, resumoParaEmail, resumosDoCache, tetoDiario } from "./resumo-email";
import { buildSearch, type EditalResumo } from "./search";
import type { Resumo } from "./summary";

export interface Alert {
  id: number;
  user_id: number;
  nome: string;
  palavras: string;
  ufs: string[];
  modalidades: number[];
  valor_min: string | null;
  valor_max: string | null;
}

export const MAX_POR_ALERTA = 30;
/** Active plus paused alerts per account. */
export const MAX_ALERTAS = 20;

/** Legal notice under every digest (docs/empresa/avisos-produto.md §2); the CNPJ only once it is known. */
export const AVISO_DIGEST = `O alerta é um filtro automático do PNCP: editais podem não aparecer e os dados podem ter erros. Confira sempre o edital oficial. ${[
  EMPRESA.produto,
  EMPRESA.razaoSocial,
  EMPRESA.cnpj && `CNPJ ${EMPRESA.cnpj}`,
  "sem vínculo com o governo",
]
  .filter(Boolean)
  .join(" · ")}.`;

export async function matchesForAlert(db: Pool, a: Alert): Promise<EditalResumo[]> {
  const { sql, params } = buildSearch(
    {
      palavras: a.palavras,
      ufs: a.ufs,
      modalidades: a.modalidades,
      valorMin: a.valor_min == null ? null : Number(a.valor_min),
      valorMax: a.valor_max == null ? null : Number(a.valor_max),
      abertas: true,
      excluirEnviadosAlerta: a.id,
      ordem: "prazo",
    },
    { limit: MAX_POR_ALERTA },
  );
  return (await db.query<EditalResumo>(sql, params)).rows;
}

const C = { text: "#18181b", muted: "#5f5f6b", border: "#e6e6e9", accent: "#1e293b", warn: "#b42318", bg: "#fbfbfa" };

/** Table-based HTML so it renders the same in Gmail, Outlook and Apple Mail. */
/** One e-mail's alert groups. */
type Grupos = { alert: Alert; editais: EditalResumo[] }[];

/** A line at the top of an e-mail: "Sua CRF do FGTS vence em 3 dias." and where to renew it, when we know. */
export interface AvisoCertidao {
  texto: string;
  link: string | null;
}

export const avisosDasCertidoes = (cs: Certidao[], hoje: string): AvisoCertidao[] =>
  certidoesParaAvisar(cs, hoje).map((c) => ({ texto: textoDoAviso(c, hoje), link: linkDaCertidao(c) }));

const linhaDeAviso = (a: AvisoCertidao) => `<div style="margin-top:6px"><b>${escapeHtml(a.texto)}</b>${a.link ? ` <a href="${escapeHtml(a.link)}" style="display:inline-block;padding:10px 6px;color:${C.accent};font-weight:600;text-decoration:underline">Emitir →</a>` : ""}</div>`;

/** The top-of-e-mail block, or "" when there is nothing to warn about. */
const blocoDeAvisos = (avisos: AvisoCertidao[]) =>
  avisos.length
    ? `<tr><td style="padding:14px 24px;background:#fff7ed;border-bottom:1px solid ${C.border};font-size:13px;line-height:19px;color:${C.text}">
<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.warn}">Certidões</div>${avisos.map(linhaDeAviso).join("")}
<div style="margin-top:2px"><a href="__APP__/certidoes" style="display:inline-block;padding:10px 0;color:${C.muted};text-decoration:underline">Ver minhas certidões</a></div>
</td></tr>`
    : "";


export function renderDigest(
  appUrl: string,
  grupos: Grupos,
  now = new Date(),
  resumos: Map<string, Resumo> = new Map(),
  avisos: AvisoCertidao[] = [],
  recompras: Recompras | null = null,
): Omit<Mail, "to"> {
  const total = grupos.reduce((n, g) => n + g.editais.length, 0);
  const subject = `${total} ${total === 1 ? "novo edital" : "novos editais"} para você`;
  const link = (e: EditalResumo) => `${appUrl}/edital/${encodeURIComponent(e.id)}`;
  const quando = (e: EditalResumo) =>
    e.encerramento ? `propostas até ${formatData(e.encerramento)} (${prazo(e.encerramento, now)})` : "prazo não informado no PNCP";

  // The (up to) three editais that may carry an AI summary; a block shows only when its summary exists, never an error.
  const comResumo = new Map(
    escolherParaResumo(
      grupos.flatMap((g) => g.editais),
      now,
    )
      .filter((e) => resumos.has(e.id))
      .map((e) => [e.id, blocoDoResumo(resumos.get(e.id)!)] as const),
  );
  // An edital listed by two alerts shows its block under the first one only. The text and the HTML each keep their own
  // record of what they already showed.
  const porVersao = () => {
    const mostrados = new Set<string>();
    return (e: EditalResumo) => {
      const b = comResumo.get(e.id);
      if (!b || mostrados.has(e.id)) return null;
      mostrados.add(e.id);
      return b;
    };
  };
  const blocoTexto = porVersao();
  const blocoParaHtml = porVersao();

  const text = [
    subject,
    ...(avisos.length ? [`\nCertidões:\n${avisos.map((a) => `- ${a.texto}${a.link ? ` Emitir: ${a.link}` : ""}`).join("\n")}`] : []),
    ...grupos.map(
      (g) =>
        `\n## ${g.alert.nome}\n\n` +
        g.editais
          .map((e) => {
            const b = blocoTexto(e);
            const resumo = b
              ? `\n  Resumo por IA (confira no edital): ${b.objeto}\n${[b.prazo && `  Prazo no edital: ${b.prazo}`, `  Participação: ${b.meEpp}`, ...b.atencao.map((a) => `  Atenção: ${a}`)]
                  .filter(Boolean)
                  .join("\n")}\n  Ver resumo completo: ${link(e)}`
              : "";
            return `- ${frase(e.objeto)}\n  ${nome(e.orgao)} · ${local(e.municipio, e.uf)}\n  ${formatBRL(e.valor_estimado)} · ${quando(e)}\n  ${link(e)}${resumo}`;
          })
          .join("\n\n"),
    ),
    ...(vazio(recompras) ? [] : [textoDaSecao(appUrl, recompras!)]),
    `\nGerenciar alertas: ${appUrl}/alertas`,
    `\n${AVISO_DIGEST}`,
  ].join("\n");

  // Plain table cells and inline styles only, so Gmail, Outlook and Apple Mail draw the same block.
  const blocoHtml = (e: EditalResumo) => {
    const b = blocoParaHtml(e);
    if (!b) return "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td style="background:#f1f5f9;border-left:3px solid ${C.accent};padding:10px 12px;font-size:13px;line-height:19px;color:${C.text}">
<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">Resumo por IA · confira no edital</div>
<div style="margin-top:4px">${escapeHtml(b.objeto)}</div>
${b.prazo ? `<div style="margin-top:4px"><b>Prazo no edital:</b> ${escapeHtml(b.prazo)}</div>\n` : ""}<div style="margin-top:4px"><b>Participação:</b> ${escapeHtml(b.meEpp)}</div>
${b.atencao.map((a) => `<div style="margin-top:4px;color:${C.warn}"><b>Atenção:</b> ${escapeHtml(a)}</div>\n`).join("")}<div style="margin-top:6px"><a href="${link(e)}" style="color:${C.accent};font-weight:600;text-decoration:underline">Ver resumo completo</a></div>
</td></tr></table>`;
  };

  const linhas = (g: { alert: Alert; editais: EditalResumo[] }) =>
    g.editais
      .map(
        (e) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.border}">
<a href="${link(e)}" style="color:${C.text};font-weight:600;font-size:14px;line-height:20px;text-decoration:none">${escapeHtml(frase(e.objeto).slice(0, 220))}</a>
<div style="font-size:12px;color:${C.muted};margin-top:4px">${escapeHtml(nome(e.orgao))} · ${escapeHtml(local(e.municipio, e.uf))} · ${escapeHtml(e.modalidade ?? "")}</div>
<div style="font-size:13px;margin-top:6px"><b>${escapeHtml(formatBRL(e.valor_estimado))}</b> <span style="color:${C.warn}">· ${escapeHtml(quando(e))}</span></div>${blocoHtml(e)}
</td></tr>`,
      )
      .join("");

  const html = `<!doctype html><html><body style="margin:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.text}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${C.border}">
<span style="font-weight:700;color:${C.accent}">Vencedital</span>
<div style="font-size:20px;font-weight:700;margin-top:8px">${escapeHtml(subject)}</div>
</td></tr>
${blocoDeAvisos(avisos).replaceAll("__APP__", appUrl)}${grupos
  .map(
    (g) => `<tr><td style="padding:16px 24px 0">
<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">${escapeHtml(g.alert.nome)} · ${g.editais.length}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas(g)}</table>
</td></tr>`,
  )
  .join("")}
${vazio(recompras) ? "" : htmlDaSecao(appUrl, recompras!, C)}<tr><td style="padding:20px 24px">
<a href="${appUrl}/pipeline" style="display:inline-block;background:${C.accent};color:#fff;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir Minhas disputas</a>
</td></tr>
</table>
<p style="font-size:12px;color:${C.muted};max-width:600px">${escapeHtml(AVISO_DIGEST)}</p>
<p style="font-size:12px;color:${C.muted};max-width:600px">Você recebe este e-mail porque criou alertas no Vencedital. <a href="${appUrl}/alertas" style="color:${C.muted}">Gerenciar alertas</a>.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

export interface DigestDoUsuario {
  email: string;
  userId: number;
  grupos: Grupos;
  /** All the user's active alerts, also the ones with no new edital today (they still feed the recompra section). */
  alerts: Alert[];
}

/** Who gets an e-mail now and what is in it: the open, not-yet-sent editais of each user's active alerts. */
export async function montarDigests(db: Pool): Promise<DigestDoUsuario[]> {
  const alerts = (
    await db.query<Alert & { email: string }>(
      `select a.*, u.email from alerts a join users u on u.id = a.user_id where a.ativo order by a.user_id, a.id`,
    )
  ).rows;
  const porUsuario = new Map<string, (Alert & { email: string })[]>();
  for (const a of alerts) porUsuario.set(a.email, [...(porUsuario.get(a.email) ?? []), a]);

  const digests: DigestDoUsuario[] = [];
  for (const [email, userAlerts] of porUsuario) {
    const grupos: Grupos = [];
    for (const alert of userAlerts) {
      const editais = await matchesForAlert(db, alert);
      if (editais.length) grupos.push({ alert, editais });
    }
    if (grupos.length) digests.push({ email, userId: userAlerts[0].user_id, grupos, alerts: userAlerts });
  }
  return digests;
}

/**
 * The 06h step before the 7h send: makes sure the editais that get a summary block in each e-mail have a summary.
 * Stops at `maxMs` so the 7h send is never late; whatever is missing then goes out without a block.
 */
export async function prepararResumosDoDigest(
  db: Pool,
  { maxMs = 35 * 60_000, log = () => {}, now = () => new Date() }: { maxMs?: number; log?: (m: string) => void; now?: () => Date } = {},
): Promise<{ escolhidos: number; resumidos: number }> {
  if (tetoDiario() <= 0) return { escolhidos: 0, resumidos: 0 };
  const inicio = Date.now();
  const ids = new Set<string>();
  for (const d of await montarDigests(db)) {
    for (const e of escolherParaResumo(d.grupos.flatMap((g) => g.editais), now())) ids.add(e.id);
  }
  const prontos = await resumosDoCache(db, [...ids]);
  let resumidos = 0;
  for (const id of ids) {
    if (prontos.has(id)) continue;
    if (Date.now() - inicio > maxMs) {
      log("resumos do e-mail: tempo esgotado, os editais que faltam seguem sem bloco");
      break;
    }
    const { rows } = await db.query<EditalRow>(`select * from editais where id = $1`, [id]);
    if (rows[0] && (await resumoParaEmail(db, rows[0]))) resumidos++;
  }
  return { escolhidos: ids.size, resumidos };
}

/**
 * The "contracts ending soon" section of one user's digest. It can only add to the e-mail: a slow query (cut at 20 s) or
 * an error means the e-mail goes out without the section, and the contracts stay unsent for the next day.
 */
async function recomprasDoDigest(db: Pool, userId: number, alerts: Alert[], hoje: string, log: (m: string) => void): Promise<Recompras | null> {
  const client = await db.connect();
  try {
    await client.query("set statement_timeout = 20000");
    const { rows } = await client.query<{ cnpj: string | null }>(`select cnpj from users where id = $1`, [userId]);
    const r = await recomprasDoUsuario(client, userId, alerts, hoje, { cnpj: rows[0]?.cnpj ?? null });
    return vazio(r) ? null : r;
  } catch (e) {
    log(`recompra: sem a seção para o usuário ${userId} (${e instanceof Error ? e.message : e})`);
    return null;
  } finally {
    await client.query("reset statement_timeout").catch(() => {});
    client.release();
  }
}

/**
 * The short e-mail for a user who has a certificate to warn about but no new edital today. Same footer rules as the
 * digest: plain tables, inline styles, a text version.
 */
export function renderAvisoCertidoes(appUrl: string, avisos: AvisoCertidao[]): Omit<Mail, "to"> {
  const subject = avisos.length === 1 ? avisos[0].texto.replace(/\.$/, "") : `${avisos.length} certidões perto de vencer`;
  const text = [subject, "", ...avisos.map((a) => `- ${a.texto}${a.link ? ` Emitir: ${a.link}` : ""}`), "", `Minhas certidões: ${appUrl}/certidoes`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.text}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:20px 24px">
<span style="font-weight:700;color:${C.accent}">Vencedital</span>
<div style="font-size:20px;font-weight:700;margin:8px 0 12px">${escapeHtml(subject)}</div>
${avisos.map(linhaDeAviso).join("")}
<div style="margin-top:14px"><a href="${appUrl}/certidoes" style="display:inline-block;background:${C.accent};color:#fff;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px;text-decoration:none">Ver minhas certidões</a></div>
</td></tr>
</table>
<p style="font-size:12px;color:${C.muted};max-width:600px">Você recebe este aviso porque cadastrou a validade das suas certidões no Vencedital. Confira sempre a data no documento oficial. Vencedital · ${escapeHtml(EMPRESA.razaoSocial)} · sem vínculo com o governo.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

/**
 * Sends one digest per user covering all their active alerts, with the certificate warnings of the day on top; a user
 * with a warning and no new edital gets the short e-mail. Returns how many e-mails went out.
 */
export async function sendDigests(db: Pool, appUrl: string, log: (m: string) => void = () => {}): Promise<number> {
  const hoje = hojeDasCertidoes();
  const pendentes = new Map((await avisosPendentes(db, hoje)).map((a) => [a.email, a.certidoes]));
  let enviados = 0;
  for (const { email, userId, grupos, alerts } of await montarDigests(db)) {
    const certidoes = pendentes.get(email) ?? [];
    pendentes.delete(email);
    const ids = escolherParaResumo(grupos.flatMap((g) => g.editais)).map((e) => e.id);
    const resumos = await resumosDoCache(db, ids);
    const recompras = await recomprasDoDigest(db, userId, alerts, hoje, log);
    await sendMail({ to: email, ...renderDigest(appUrl, grupos, new Date(), resumos, avisosDasCertidoes(certidoes, hoje), recompras) });
    // Recorded only after the send succeeds, so a failed SMTP call retries the same editais next run.
    for (const g of grupos) {
      await db.query(
        `insert into alert_envios (alert_id, edital_id) select $1, unnest($2::text[]) on conflict do nothing`,
        [g.alert.id, g.editais.map((e) => e.id)],
      );
    }
    await marcarAvisadas(db, certidoes.map((c) => c.id), hoje);
    if (recompras) await marcarEnviadas(db, userId, recompras);
    enviados++;
    log(`${email}: ${grupos.reduce((n, g) => n + g.editais.length, 0)} editais`);
  }
  for (const [email, certidoes] of pendentes) {
    await sendMail({ to: email, ...renderAvisoCertidoes(appUrl, avisosDasCertidoes(certidoes, hoje)) });
    await marcarAvisadas(db, certidoes.map((c) => c.id), hoje);
    enviados++;
    log(`${email}: aviso de ${certidoes.length} certidão(ões)`);
  }
  return enviados;
}


