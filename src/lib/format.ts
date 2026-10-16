const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function formatBRL(v: number | string | null | undefined): string {
  // PNCP reports secret budgets ("orçamento sigiloso") as 0.
  if (v == null || v === "" || Number(v) === 0) return "valor sigiloso ou não informado";
  return brl.format(Number(v));
}

export function formatData(d: Date | string | null | undefined): string {
  if (!d) return "não informado";
  return dataHora.format(new Date(d));
}

/** "em 3 dias", "hoje", "encerrado". */
export function prazo(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "prazo não informado";
  const ms = new Date(d).getTime() - now.getTime();
  if (ms <= 0) return "encerrado";
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return `hoje, em ${Math.max(1, Math.round(ms / 3_600_000))}h`;
  return dias === 1 ? "amanhã" : `em ${dias} dias`;
}

/** Closes within `dias` days (and hasn't closed yet). */
export function urgente(d: Date | string | null | undefined, dias = 3, now = new Date()): boolean {
  if (!d) return false;
  const ms = new Date(d).getTime() - now.getTime();
  return ms > 0 && ms < dias * 86_400_000;
}
