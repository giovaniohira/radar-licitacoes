import type { Pool } from "pg";
import { escapeHtml, sendMail, type Mail } from "./mail";
import { formatBRL, formatData, frase, local, nome, prazo } from "./format";
import { buildSearch, type EditalResumo } from "./search";

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

const C = { text: "#18181b", muted: "#5f5f6b", border: "#e6e6e9", accent: "#0f766e", warn: "#a16207", bg: "#fbfbfa" };

/** Table-based HTML so it renders the same in Gmail, Outlook and Apple Mail. */
export function renderDigest(appUrl: string, grupos: { alert: Alert; editais: EditalResumo[] }[], now = new Date()): Omit<Mail, "to"> {
  const total = grupos.reduce((n, g) => n + g.editais.length, 0);
  const subject = `${total} ${total === 1 ? "novo edital" : "novos editais"} para você`;
  const link = (e: EditalResumo) => `${appUrl}/edital/${encodeURIComponent(e.id)}`;
  const quando = (e: EditalResumo) =>
    e.encerramento ? `propostas até ${formatData(e.encerramento)} (${prazo(e.encerramento, now)})` : "prazo não informado no PNCP";

  const text = [
    subject,
    ...grupos.map(
      (g) =>
        `\n## ${g.alert.nome}\n\n` +
        g.editais
          .map((e) => `- ${frase(e.objeto)}\n  ${nome(e.orgao)} · ${local(e.municipio, e.uf)}\n  ${formatBRL(e.valor_estimado)} · ${quando(e)}\n  ${link(e)}`)
          .join("\n\n"),
    ),
    `\nGerenciar alertas: ${appUrl}/alertas`,
  ].join("\n");

  const linhas = (g: { alert: Alert; editais: EditalResumo[] }) =>
    g.editais
      .map(
        (e) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.border}">
<a href="${link(e)}" style="color:${C.text};font-weight:600;font-size:14px;line-height:20px;text-decoration:none">${escapeHtml(frase(e.objeto).slice(0, 220))}</a>
<div style="font-size:12px;color:${C.muted};margin-top:4px">${escapeHtml(nome(e.orgao))} · ${escapeHtml(local(e.municipio, e.uf))} · ${escapeHtml(e.modalidade ?? "")}</div>
<div style="font-size:13px;margin-top:6px"><b>${escapeHtml(formatBRL(e.valor_estimado))}</b> <span style="color:${C.warn}">· ${escapeHtml(quando(e))}</span></div>
</td></tr>`,
      )
      .join("");

  const html = `<!doctype html><html><body style="margin:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.text}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${C.border}">
<span style="font-weight:700;color:${C.accent}">Radar</span>
<div style="font-size:20px;font-weight:700;margin-top:8px">${escapeHtml(subject)}</div>
</td></tr>
${grupos
  .map(
    (g) => `<tr><td style="padding:16px 24px 0">
<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">${escapeHtml(g.alert.nome)} · ${g.editais.length}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas(g)}</table>
</td></tr>`,
  )
  .join("")}
<tr><td style="padding:20px 24px">
<a href="${appUrl}/pipeline" style="display:inline-block;background:${C.accent};color:#fff;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir meu pipeline</a>
</td></tr>
</table>
<p style="font-size:12px;color:${C.muted};max-width:600px">Você recebe este e-mail porque criou alertas no Radar de Licitações. <a href="${appUrl}/alertas" style="color:${C.muted}">Gerenciar alertas</a>.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

/** Sends one digest per user covering all their active alerts. Returns how many e-mails went out. */
export async function sendDigests(db: Pool, appUrl: string, log: (m: string) => void = () => {}): Promise<number> {
  const alerts = (
    await db.query<Alert & { email: string }>(
      // The demo account is shared and its address is fake, so it never gets mail.
      `select a.*, u.email from alerts a join users u on u.id = a.user_id where a.ativo and not u.demo order by a.user_id, a.id`,
    )
  ).rows;
  const porUsuario = new Map<string, (Alert & { email: string })[]>();
  for (const a of alerts) porUsuario.set(a.email, [...(porUsuario.get(a.email) ?? []), a]);

  let enviados = 0;
  for (const [email, userAlerts] of porUsuario) {
    const grupos: { alert: Alert; editais: EditalResumo[] }[] = [];
    for (const alert of userAlerts) {
      const editais = await matchesForAlert(db, alert);
      if (editais.length) grupos.push({ alert, editais });
    }
    if (!grupos.length) continue;
    await sendMail({ to: email, ...renderDigest(appUrl, grupos) });
    // Recorded only after the send succeeds, so a failed SMTP call retries the same editais next run.
    for (const g of grupos) {
      await db.query(
        `insert into alert_envios (alert_id, edital_id) select $1, unnest($2::text[]) on conflict do nothing`,
        [g.alert.id, g.editais.map((e) => e.id)],
      );
    }
    enviados++;
    log(`${email}: ${grupos.reduce((n, g) => n + g.editais.length, 0)} editais`);
  }
  return enviados;
}
