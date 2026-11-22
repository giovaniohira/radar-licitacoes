// Public Receita Federal data for a CNPJ (via BrasilAPI), used to pre-fill the onboarding: state and sectors.
// Only the CNPJ number leaves the server. Any failure returns null and the user just fills the steps by hand.
import { SETORES } from "./setores";

export interface DadosCnpj {
  razaoSocial: string;
  uf: string | null;
  /** Main CNAE first, then the secondary ones, as 7 digits. */
  cnaes: string[];
}

interface RespostaBrasilApi {
  razao_social?: string;
  uf?: string;
  cnae_fiscal?: number | string;
  cnaes_secundarios?: { codigo?: number | string }[];
}

// Same response shape (Minha Receita is the data source behind BrasilAPI). Without a User-Agent, BrasilAPI answers 403.
const FONTES = ["https://brasilapi.com.br/api/cnpj/v1/", "https://minhareceita.org/"];

export async function consultarCnpj(cnpj: string, fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<DadosCnpj | null> {
  for (const fonte of FONTES) {
    const dados = await consultar(fonte + encodeURIComponent(cnpj), fetchImpl, timeoutMs);
    if (dados) return dados;
  }
  return null;
}

async function consultar(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<DadosCnpj | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json", "user-agent": "Vencedital/1.0 (+https://vencedital.com.br)" },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as RespostaBrasilApi;
    const cnaes = [d.cnae_fiscal, ...(d.cnaes_secundarios ?? []).map((c) => c.codigo)]
      .map((c) => String(c ?? "").replace(/\D/g, ""))
      .filter((c) => c.length === 7 && c !== "0000000");
    const uf = typeof d.uf === "string" && /^[A-Z]{2}$/.test(d.uf) ? d.uf : null;
    return { razaoSocial: String(d.razao_social ?? "").trim(), uf, cnaes };
  } catch {
    return null;
  }
}

/** Onboarding sectors whose CNAE classes (first 4 digits) appear in the company's CNAEs, main activity first. */
export function setoresDoCnae(cnaes: string[]): string[] {
  const classes = cnaes.map((c) => c.slice(0, 4));
  const achados = SETORES.map((s) => ({ id: s.id, pos: Math.min(...s.cnae.split(",").map((c) => classes.indexOf(c.replace(/\D/g, "").slice(0, 4))).map((i) => (i < 0 ? Infinity : i))) }))
    .filter((s) => s.pos !== Infinity)
    .sort((a, b) => a.pos - b.pos);
  return achados.map((s) => s.id);
}
