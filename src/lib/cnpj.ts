// CNPJ helpers with no Node imports, so the onboarding can validate and mask on the client too.
// Includes the alphanumeric format the Receita Federal issues from July 2026 (IN RFB 2.229/2024).

function dv(base: string): number {
  // Character value is its ASCII code minus 48: digits keep their value, A=17 … Z=42.
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * [2, 3, 4, 5, 6, 7, 8, 9][(base.length - 1 - i) % 8];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** 14 characters, uppercase, no punctuation, check digits valid; or null. */
export function normalizeCnpj(input: string): string | null {
  const c = input.replace(/[\s./-]/g, "").toUpperCase();
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1+$/.test(c)) return null;
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`) ? c : null;
}

export function formatCnpj(c: string): string {
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}


/** Progressive mask while typing: keeps letters and digits, at most 14, punctuated as 00.000.000/0000-00. */
export function mascaraCnpj(input: string): string {
  const c = input.replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(0, 14);
  return [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8)].filter(Boolean).join(".") + (c.length > 8 ? `/${c.slice(8, 12)}` : "") + (c.length > 12 ? `-${c.slice(12)}` : "");
}
