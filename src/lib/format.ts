const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("pt-BR");
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
const soData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

export function formatBRL(v: number | string | null | undefined): string {
  // PNCP reports secret budgets ("orçamento sigiloso") as 0.
  if (v == null || v === "" || Number(v) === 0) return "Sigiloso";
  return brl.format(Number(v));
}

export function formatBRLCompact(v: number | string | null | undefined): string {
  if (v == null || v === "" || Number(v) === 0) return "—";
  return brlCompact.format(Number(v));
}

export const formatInt = (v: number | string | null | undefined) => int.format(Number(v ?? 0));

export function formatData(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dataHora.format(new Date(d));
}

/** SQL `date` values arrive as "YYYY-MM-DD" (see db.ts); pin them to midday in Brasília so no timezone shifts the day. */
const asDate = (d: Date | string) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00-03:00`) : new Date(d));

export function formatDia(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return soData.format(asDate(d));
}

export function formatDiaCurto(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dataCurta.format(asDate(d)).replace(".", "");
}

export const horasAtras = (h: number, now = Date.now()) => new Date(now - h * 3_600_000);

export function formatCNPJ(c: string): string {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** "em 3 dias", "hoje, em 5h", "encerrado". */
export function prazo(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "sem prazo";
  const ms = new Date(d).getTime() - now.getTime();
  if (ms <= 0) return "encerrado";
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return `hoje, em ${Math.max(1, Math.round(ms / 3_600_000))}h`;
  return dias === 1 ? "amanhã" : `em ${dias} dias`;
}

/** Only deadlines that `prazo()` shows as "em 3 dias" or sooner get a color; everything else stays neutral. */
export function prazoTom(d: Date | string | null | undefined, now = new Date()): "neutral" | "warn" {
  if (!d) return "neutral";
  const ms = new Date(d).getTime() - now.getTime();
  return ms > 0 && ms < 4 * 86_400_000 ? "warn" : "neutral";
}

// Kept upper-case when PNCP's all-caps text is converted.
const SIGLAS = new Set(
  "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SP TO FNDE PNAE CNES ANVISA INMETRO ME EPP MEI TI SUS CNPJ CPF EPI EPIS UBS CRAS CREAS CAPS SRP PNCP LTDA EIRELI SA UF GLP LED PVC CFTV HD SSD TV ABNT NBR INSS FGTS ISS ICMS CNH PCD UPA UTI SAMU ETE ETA GPS USB RAM PC IP VOIP WI-FI SEMED SEMSA SMS SME FMS PMDB DER DNIT IFPR IFSP UFPR UFMG UFRJ USP UNICAMP EBSERH CPRM DETRAN PM PMS CBM TJ TRT TRE TRF MPF MP DPU AGU INSS IBGE OAB CRM CREA SENAI SESC SESI SEBRAE II III IV VI VII VIII IX XI XII".split(" "),
);
const MINUSCULAS = new Set("a o as os e de da do das dos em no na nos nas para por com sem ao aos à às ou".split(" "));

function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length > 0.7;
}

function caseWord(w: string, first: boolean, title: boolean): string {
  // "BELÁGUA/MA" -> "belágua/MA": each slash-separated part is cased on its own.
  if (w.includes("/")) return w.split("/").map((part, i) => (i > 0 && /^[A-Z]{2}\W*$/.test(part) ? part : caseWord(part, first && i === 0, title))).join("/");
  const bare = w.replace(/[^A-Za-zÀ-ÿ0-9-]/g, "");
  if (SIGLAS.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return w;
  const lower = w.toLocaleLowerCase("pt-BR");
  if (!first && (!title || MINUSCULAS.has(lower))) return lower;
  return lower.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("pt-BR"));
}

function recase(s: string, title: boolean): string {
  let sentenceStart = true;
  return s
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const out = caseWord(tok, sentenceStart, title);
      sentenceStart = /[.:;!?]$/.test(tok);
      return out;
    })
    .join("");
}

/** Sentence case for PNCP's ALL-CAPS objects; text that is already mixed case is left alone. */
export function frase(s: string | null | undefined): string {
  if (!s) return "";
  return isAllCaps(s) ? recase(s, false) : s;
}

/** Title case for ALL-CAPS proper names (órgãos, municípios, fornecedores). */
export function nome(s: string | null | undefined): string {
  if (!s) return "";
  return isAllCaps(s) ? recase(s, true) : s;
}

export function local(municipio: string | null | undefined, uf: string | null | undefined): string {
  return [nome(municipio), uf].filter(Boolean).join(" · ");
}

// Openings PNCP objects repeat word for word. Applied in a loop, so
// "A presente licitação tem como objeto a contratação de empresa especializada para aquisição de X" ends at "X".
const PREFIXOS = [
  /^\[[^\]]*\]\s*[-–—:]?\s*/,
  /^constitui\s+objeto\s+\S+\s+[^,.;]{0,60}?\bvisando\s+(?:[aào]\s+)?/i,
  /^(?:[ao]\s+)?(?:presente|objeto)\s[^,.;]{0,80}?\s(?:objeto|objetivo|finalidade|visa|é)\s+(?:[ao]\s+|:\s*)?/i,
  /^sele[cç][aã]o\s+da\s+proposta\s+mais\s+vantajosa\s+(?:para|visando)\s+(?:[ao]\s+)?/i,
  /^despesa\s+referente\s+(?:[aà]\s+)?/i,
  /^(?:implanta[cç][aã]o\s+de\s+)?registro\s+de\s+pre[cç]os?\s+(?:para\s+(?:[ao]s?\s+)?)?(?:futuras?\s+e\s+eventua(?:l|is)\s+)?/i,
  /^contrata[cç][aã]o\s+de\s+(?:empresa|pessoa\s+jur[ií]dica)(?:\s+especializada)?\s+(?:para|visando|em|na|no)\s+(?:[ao]\s+)?/i,
  /^(?:contrata[cç][aã]o|aquisi[cç][aã]o|fornecimento|presta[cç][aã]o)\s+de\s+/i,
  /^servi[cç]os?\s+especializados?\s+(?:para|de|em)\s+/i,
];
const CAUDA = /,?\s+(?:que\s+ser[aã]o|destinad[oa]s?|conforme|para\s+atender|visando|a\s+fim\s+de|de\s+acordo\s+com|em\s+atendimento|atrav[eé]s\s+d[ae])\b.*$/i;

/** Short list title for an object: drops the boilerplate opening and the "destinados a..." tail. Pass it through `frase()` first. */
export function tituloCurto(objeto: string, max = 80): string {
  let s = objeto.replace(/\s+/g, " ").trim();
  for (let antes = ""; antes !== s; ) {
    antes = s;
    for (const re of PREFIXOS) s = s.replace(re, "");
  }
  s = s.replace(CAUDA, "").replace(/[\s,.;:-]+$/, "");
  if (s.length < 3) return objeto;
  if (s.length > max) s = s.slice(0, s.lastIndexOf(" ", max)) + "…";
  return s[0].toLocaleUpperCase("pt-BR") + s.slice(1);
}

/** Lowercase without accents, for loose comparisons. */
export const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/** Splits `texto` around the first alert keyword it contains (accent- and case-insensitive), or null. */
export function destacar(texto: string, palavras: string): [string, string, string] | null {
  const chars = [...texto];
  const dobrados = chars.map(dobra);
  // Index math below needs one folded char per original char.
  if (dobrados.some((c) => c.length !== 1)) return null;
  const alvo = dobrados.join("");
  let melhor: [number, number] | null = null;
  for (const termo of palavras.split(/[,;\n]+/)) {
    const q = dobra(termo.replace(/"/g, "").replace(/(^|\s)-\S+/g, "")).trim();
    const i = q ? alvo.indexOf(q) : -1;
    if (i >= 0 && (!melhor || i < melhor[0])) melhor = [i, q.length];
  }
  if (!melhor) return null;
  const [i, n] = melhor;
  return [chars.slice(0, i).join(""), chars.slice(i, i + n).join(""), chars.slice(i + n).join("")];
}
