// Public Receita Federal data for a CNPJ (via BrasilAPI), used to pre-fill the onboarding: state and sectors.
// Only the CNPJ number leaves the server. Any failure returns null and the user just fills the steps by hand.
import { SETORES } from "./setores";

export interface DadosCnpj {
  razaoSocial: string;
  municipio: string | null;
  uf: string | null;
  /** Year the company opened, from data_inicio_atividade. */
  abertura: number | null;
  /** Main activity as written by the Receita, e.g. "Fabricação de produtos de panificação". */
  atividade: string | null;
  /** Main CNAE first, then the secondary ones, as 7 digits. */
  cnaes: string[];
}

interface RespostaBrasilApi {
  razao_social?: string;
  municipio?: string;
  uf?: string;
  data_inicio_atividade?: string;
  cnae_fiscal_descricao?: string;
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
    const abertura = Number(String(d.data_inicio_atividade ?? "").slice(0, 4));
    return {
      razaoSocial: String(d.razao_social ?? "").trim(),
      municipio: typeof d.municipio === "string" && d.municipio.trim() ? d.municipio.trim() : null,
      uf,
      abertura: abertura > 1800 ? abertura : null,
      atividade: typeof d.cnae_fiscal_descricao === "string" && d.cnae_fiscal_descricao.trim() ? d.cnae_fiscal_descricao.trim() : null,
      cnaes,
    };
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

/** "1091102" → "1091-1/02", as the Receita prints a CNAE. */
export function formatCnae(c: string): string {
  return c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}` : c;
}

// Words that say nothing about what a company sells: contract boilerplate and generic nouns.
const VAZIAS = new Set(
  `aquisicao contratacao contratar empresa especializada fornecimento prestacao servico servicos material materiais
  objeto presente registro preco precos eventual eventuais futura futuras atender atendimento necessidade necessidades
  secretaria municipal municipio estadual federal prefeitura governo fundo publica publico orgao diversos diversas
  conforme especificacoes termo referencia anexo edital processo pregao eletronico lote lotes item itens quantidade
  unidade unidades tipo para pela pelo com sem das dos uma umas uns entre durante periodo meses ano anos demanda
  manutencao destinados destinadas destinado destinada visando utilizacao uso geral gerais demais outros outras`.split(/\s+/),
);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Up to `max` words that keep showing up in the objects of contracts the company won, most frequent first.
 * A word counts once per contract and must appear in at least 2. Returned with the accents of its first use.
 */
export function palavrasDoHistorico(objetos: string[], max = 3): string[] {
  const conta = new Map<string, { n: number; forma: string }>();
  for (const objeto of objetos) {
    const vistas = new Set<string>();
    for (const forma of objeto.toLowerCase().match(/\p{L}+/gu) ?? []) {
      const chave = semAcento(forma);
      if (chave.length < 5 || VAZIAS.has(chave) || vistas.has(chave)) continue;
      vistas.add(chave);
      const atual = conta.get(chave);
      conta.set(chave, { n: (atual?.n ?? 0) + 1, forma: atual?.forma ?? forma });
    }
  }
  return [...conta.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n || a.forma.localeCompare(b.forma))
    .slice(0, max)
    .map((c) => c.forma);
}

/**
 * The sectors to pre-select, at most `max`. Secondary CNAEs alone are noisy (distributors list dozens), so each sector
 * scores 2 for the main CNAE, 1 for a secondary one, and 2 more when the words of the company's own contracts show up in
 * its keywords. Only the strongest stay: those within 1 point of the best.
 */
export function setoresSugeridos(cnaes: string[], historico: string[], max = 2): string[] {
  const principal = cnaes[0]?.slice(0, 4);
  const classes = new Set(cnaes.map((c) => c.slice(0, 4)));
  const hist = historico.map(semAcento);
  const notas = SETORES.map((s) => {
    const codigos = s.cnae.split(",").map((c) => c.replace(/\D/g, "").slice(0, 4));
    const termos = semAcento(s.palavras).split(/[^a-z]+/);
    const cnae = codigos.includes(principal ?? "") ? 2 : codigos.some((c) => classes.has(c)) ? 1 : 0;
    // Ties go to the sector matching the most frequent contract word.
    const primeira = hist.findIndex((h) => termos.includes(h));
    return { id: s.id, nota: cnae + (primeira >= 0 ? 2 : 0), primeira: primeira >= 0 ? primeira : Infinity };
  }).filter((s) => s.nota > 0);
  const melhor = Math.max(0, ...notas.map((s) => s.nota));
  return notas
    .filter((s) => s.nota >= melhor - 1)
    .sort((a, b) => b.nota - a.nota || a.primeira - b.primeira)
    .slice(0, max)
    .map((s) => s.id);
}
