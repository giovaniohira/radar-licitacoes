import type { Pool } from "pg";
import { escapeHtml, sendMail, type Mail } from "./mail";
import { formatBRL, formatData, prazo } from "./format";
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
    },
    { limit: MAX_POR_ALERTA },
  );
  return (await db.query<EditalResumo>(sql, params)).rows;
}

export function renderDigest(appUrl: string, grupos: { alert: Alert; editais: EditalResumo[] }[], now = new Date()): Omit<Mail, "to"> {
  const total = grupos.reduce((n, g) => n + g.editais.length, 0);
  const subject = `${total} ${total === 1 ? "novo edital" : "novos editais"} para você`;
  const text = grupos
    .map(
      (g) =>
        `## ${g.alert.nome}\n\n` +
        g.editais
          .map(
            (e) =>
              `- ${e.objeto}\n  ${e.orgao} (${[e.municipio, e.uf].filter(Boolean).join("/")})\n  ${formatBRL(e.valor_estimado)} · ${e.encerramento ? `propostas até ${formatData(e.encerramento)} (${prazo(e.encerramento, now)})` : "prazo não informado no PNCP"}\n  ${appUrl}/edital/${encodeURIComponent(e.id)}`,
          )
          .join("\n\n"),
    )
    .join("\n\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;color:#1c1917">
<h1 style="font-size:20px">${escapeHtml(subject)}</h1>
${grupos
  .map(
    (g) => `<h2 style="font-size:16px;margin-top:28px;border-bottom:1px solid #e7e5e4;padding-bottom:6px">${escapeHtml(g.alert.nome)}</h2>
${g.editais
  .map(
    (e) => `<div style="margin:14px 0">
<a href="${appUrl}/edital/${encodeURIComponent(e.id)}" style="color:#1d4ed8;font-weight:600;text-decoration:none">${escapeHtml(e.objeto)}</a>
<div style="font-size:13px;color:#57534e">${escapeHtml(e.orgao)} · ${escapeHtml([e.municipio, e.uf].filter(Boolean).join("/"))} · ${escapeHtml(e.modalidade ?? "")}</div>
<div style="font-size:13px">${escapeHtml(formatBRL(e.valor_estimado))} · ${e.encerramento ? `propostas até <b>${escapeHtml(formatData(e.encerramento))}</b> (${escapeHtml(prazo(e.encerramento, now))})` : "prazo não informado no PNCP"}</div>
</div>`,
  )
  .join("")}`,
  )
  .join("")}
<p style="font-size:12px;color:#78716c;margin-top:32px">Você recebe este e-mail porque criou alertas no Radar de Licitações. <a href="${appUrl}/painel">Gerenciar alertas</a>.</p>
</div>`;
  return { subject, html, text };
}

/** Sends one digest per user covering all their active alerts. Returns how many e-mails went out. */
export async function sendDigests(db: Pool, appUrl: string, log: (m: string) => void = () => {}): Promise<number> {
  const alerts = (
    await db.query<Alert & { email: string }>(
      `select a.*, u.email from alerts a join users u on u.id = a.user_id where a.ativo order by a.user_id, a.id`,
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
