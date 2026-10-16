import nodemailer, { type Transporter } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transport === undefined) {
    transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  }
  return transport;
}

/** Sends via SMTP_URL; without it (dev), prints the mail to stdout. */
export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransport();
  if (!t) {
    console.log(`\n--- e-mail (SMTP_URL não definido) ---\npara: ${mail.to}\nassunto: ${mail.subject}\n\n${mail.text}\n---\n`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM ?? "Radar de Licitações <radar@localhost>", ...mail });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
