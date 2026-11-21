/**
 * Who runs the product, as shown in the footer, legal pages and e-mails. Fields left null are not
 * printed anywhere: fill them in here when they are confirmed, never with placeholder text.
 */
export const EMPRESA = {
  produto: "Vencedital",
  razaoSocial: "OHIRA TECNOLOGIA LTDA.",
  cnpj: "68.631.511/0001-45" as string | null,
  /** Seat as published. The street address stays out until the user confirms it. */
  sede: "Porto Velho-RO" as string | null,
  /** Comarca for clause 12 of the Terms. */
  foro: "Porto Velho-RO" as string | null,
  /** Public contact and privacy channels. Null until the domain receives mail (MX): an address that bounces is worse than none. */
  contato: null as string | null,
  privacidade: null as string | null,
  /** How long database backups are kept, in days (Privacy Policy). Null until backups run. */
  backupDias: null as number | null,
};

/** Version and publication date of the Terms of Use and Privacy Policy. */
export const DOCUMENTOS = { versao: "1.0", publicadoEm: "21 de novembro de 2026" };

export const PRECO_MENSAL = 97;
export const DIAS_TESTE = 14;

/** "OHIRA TECNOLOGIA LTDA., CNPJ …, Porto Velho-RO" with only the fields that are known. */
export function quemSomos(): string {
  return [EMPRESA.razaoSocial, EMPRESA.cnpj && `CNPJ ${EMPRESA.cnpj}`, EMPRESA.sede].filter(Boolean).join(", ");
}
