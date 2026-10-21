// Client for the public PNCP APIs (https://pncp.gov.br/api/consulta/swagger-ui/index.html). No key needed.

export const CONSULTA_BASE = "https://pncp.gov.br/api/consulta/v1";
export const PNCP_BASE = "https://pncp.gov.br/api/pncp/v1";
export const PAGE_SIZE = 50; // API maximum

export const MODALIDADES: Record<number, string> = {
  1: "Leilão eletrônico",
  2: "Diálogo competitivo",
  3: "Concurso",
  4: "Concorrência eletrônica",
  5: "Concorrência presencial",
  6: "Pregão eletrônico",
  7: "Pregão presencial",
  8: "Dispensa",
  9: "Inexigibilidade",
  10: "Manifestação de interesse",
  11: "Pré-qualificação",
  12: "Credenciamento",
  13: "Leilão presencial",
};

// Inexigibilidade has no competition, so there is nothing for a supplier to bid on.
export const MODALIDADES_INGERIDAS = Object.keys(MODALIDADES).map(Number).filter((m) => m !== 9);

export interface PncpContratacao {
  numeroControlePNCP: string;
  anoCompra: number;
  sequencialCompra: number;
  orgaoEntidade: { cnpj: string; razaoSocial: string; esferaId?: string | null };
  unidadeOrgao?: {
    ufSigla?: string | null;
    municipioNome?: string | null;
    nomeUnidade?: string | null;
    codigoIbge?: string | null;
  } | null;
  objetoCompra: string;
  informacaoComplementar?: string | null;
  modalidadeId: number;
  modalidadeNome?: string | null;
  situacaoCompraNome?: string | null;
  valorTotalEstimado?: number | null;
  srp?: boolean | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataPublicacaoPncp?: string | null;
  dataAtualizacaoGlobal?: string | null;
  dataAtualizacao?: string | null;
  linkSistemaOrigem?: string | null;
}

export interface PncpPage<T> {
  data: T[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
}

export interface PncpArquivo {
  url: string;
  titulo: string;
  sequencialDocumento: number;
  tipoDocumentoNome?: string | null;
  statusAtivo: boolean;
}

export interface EditalRow {
  id: string;
  cnpj: string;
  ano: number;
  sequencial: number;
  orgao: string;
  unidade: string | null;
  uf: string | null;
  municipio: string | null;
  codigo_ibge: string | null;
  esfera: string | null;
  objeto: string;
  info_complementar: string | null;
  modalidade_id: number;
  modalidade: string | null;
  situacao: string | null;
  valor_estimado: number | null;
  srp: boolean | null;
  abertura: string | null;
  encerramento: string | null;
  publicado_em: string | null;
  atualizado_em: string | null;
  link_origem: string | null;
}

/** PNCP dates come without an offset and are Brasília time. */
export function brDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return new Date(value).toISOString();
  const withTime = value.length === 10 ? `${value}T00:00:00` : value;
  const d = new Date(`${withTime}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clean(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

export function normalize(c: PncpContratacao): EditalRow {
  const u = c.unidadeOrgao ?? {};
  return {
    id: c.numeroControlePNCP,
    cnpj: c.orgaoEntidade.cnpj,
    ano: c.anoCompra,
    sequencial: c.sequencialCompra,
    orgao: clean(c.orgaoEntidade.razaoSocial) ?? c.orgaoEntidade.cnpj,
    unidade: clean(u.nomeUnidade),
    uf: clean(u.ufSigla)?.toUpperCase().slice(0, 2) ?? null,
    municipio: clean(u.municipioNome),
    codigo_ibge: clean(u.codigoIbge),
    esfera: clean(c.orgaoEntidade.esferaId)?.slice(0, 1) ?? null,
    objeto: clean(c.objetoCompra) ?? "(sem objeto informado)",
    info_complementar: clean(c.informacaoComplementar),
    modalidade_id: c.modalidadeId,
    modalidade: clean(c.modalidadeNome) ?? MODALIDADES[c.modalidadeId] ?? null,
    situacao: clean(c.situacaoCompraNome),
    valor_estimado: typeof c.valorTotalEstimado === "number" ? c.valorTotalEstimado : null,
    srp: c.srp ?? null,
    abertura: brDate(c.dataAberturaProposta),
    encerramento: brDate(c.dataEncerramentoProposta),
    publicado_em: brDate(c.dataPublicacaoPncp),
    atualizado_em: brDate(c.dataAtualizacaoGlobal ?? c.dataAtualizacao),
    link_origem: clean(c.linkSistemaOrigem),
  };
}

export function pncpUrl(e: Pick<EditalRow, "cnpj" | "ano" | "sequencial">): string {
  return `https://pncp.gov.br/app/editais/${e.cnpj}/${e.ano}/${e.sequencial}`;
}

type Fetch = typeof fetch;

export interface FetchOpts {
  fetchImpl?: Fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Minimum gap between requests, to stay under PNCP's rate limit. */
  minIntervalMs?: number;
}

let lastRequestAt = 0;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET JSON with retries on 429/5xx/network errors. Returns null on 204 (PNCP's "no results"). */
export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T | null> {
  const { fetchImpl = fetch, retries = 6, sleep = defaultSleep, minIntervalMs = 0 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let retryAfterMs = 0;
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": "radar-licitacoes/0.1 (+https://github.com/giovaniohira/radar-licitacoes)" },
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 204) return null;
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) {
        throw new PncpError(`PNCP ${res.status} em ${url}: ${(await res.text()).slice(0, 200)}`, res.status);
      }
      retryAfterMs = Number(res.headers.get("retry-after") ?? 0) * 1000 || 0;
      lastErr = new PncpError(`PNCP ${res.status} em ${url}`, res.status);
    } catch (err) {
      if (err instanceof PncpError && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
    }
    // 2s, 4s, ... capped at 60s; a Retry-After header wins when it asks for longer.
    if (attempt < retries) await sleep(Math.max(retryAfterMs, Math.min(60_000, 2000 * 2 ** attempt)));
  }
  throw lastErr;
}

export class PncpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const CONTRATOS_PAGE_SIZE = 500; // /contratos accepts larger pages than /contratacoes

export interface PncpContrato {
  numeroControlePNCP: string;
  numeroControlePncpCompra?: string | null;
  orgaoEntidade: { cnpj: string; razaoSocial: string; esferaId?: string | null };
  unidadeOrgao?: { ufSigla?: string | null; municipioNome?: string | null } | null;
  tipoPessoa?: string | null;
  niFornecedor?: string | null;
  nomeRazaoSocialFornecedor?: string | null;
  objetoContrato?: string | null;
  categoriaProcesso?: { nome?: string | null } | null;
  tipoContrato?: { nome?: string | null } | null;
  valorGlobal?: number | null;
  valorInicial?: number | null;
  dataAssinatura?: string | null;
  dataVigenciaInicio?: string | null;
  dataVigenciaFim?: string | null;
  dataPublicacaoPncp?: string | null;
  dataAtualizacaoGlobal?: string | null;
  dataAtualizacao?: string | null;
}

export interface ContratoRow {
  id: string;
  compra_id: string | null;
  orgao_cnpj: string;
  orgao: string;
  esfera: string | null;
  uf: string | null;
  municipio: string | null;
  fornecedor_ni: string | null;
  fornecedor: string | null;
  tipo_pessoa: string | null;
  objeto: string;
  categoria: string | null;
  tipo_contrato: string | null;
  valor_global: number | null;
  data_assinatura: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  publicado_em: string | null;
  atualizado_em: string | null;
}

/** "2026-10-14" stays a date; anything unparseable (PNCP has years like 7203) becomes null. */
function isoDay(v: string | null | undefined): string | null {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Individuals (PF) are kept anonymous: no CPF and no name, and they never appear in supplier rankings. */
export function normalizeContrato(c: PncpContrato): ContratoRow {
  const u = c.unidadeOrgao ?? {};
  const pj = c.tipoPessoa === "PJ";
  const valor = typeof c.valorGlobal === "number" ? c.valorGlobal : typeof c.valorInicial === "number" ? c.valorInicial : null;
  return {
    id: c.numeroControlePNCP,
    compra_id: clean(c.numeroControlePncpCompra),
    orgao_cnpj: c.orgaoEntidade.cnpj,
    orgao: clean(c.orgaoEntidade.razaoSocial) ?? c.orgaoEntidade.cnpj,
    esfera: clean(c.orgaoEntidade.esferaId)?.slice(0, 1) ?? null,
    uf: clean(u.ufSigla)?.toUpperCase().slice(0, 2) ?? null,
    municipio: clean(u.municipioNome),
    fornecedor_ni: pj ? clean(c.niFornecedor) : null,
    fornecedor: pj ? clean(c.nomeRazaoSocialFornecedor) : c.tipoPessoa === "PF" ? "Pessoa física" : clean(c.nomeRazaoSocialFornecedor),
    tipo_pessoa: clean(c.tipoPessoa),
    objeto: clean(c.objetoContrato) ?? "(sem objeto informado)",
    categoria: clean(c.categoriaProcesso?.nome),
    tipo_contrato: clean(c.tipoContrato?.nome),
    // Negative or absurd values are data-entry errors; keep them out of the sums.
    valor_global: valor != null && valor >= 0 && valor < 1e11 ? valor : null,
    data_assinatura: isoDay(c.dataAssinatura),
    vigencia_inicio: isoDay(c.dataVigenciaInicio),
    vigencia_fim: isoDay(c.dataVigenciaFim),
    publicado_em: brDate(c.dataPublicacaoPncp),
    atualizado_em: brDate(c.dataAtualizacaoGlobal ?? c.dataAtualizacao),
  };
}

/** Contracts published on `dia` (YYYY-MM-DD). */
export async function fetchContratos(dia: string, pagina: number, opts?: FetchOpts) {
  const d = dia.replaceAll("-", "");
  const url = `${CONSULTA_BASE}/contratos?dataInicial=${d}&dataFinal=${d}&pagina=${pagina}&tamanhoPagina=${CONTRATOS_PAGE_SIZE}`;
  return getJson<PncpPage<PncpContrato>>(url, opts);
}

/** `dia` is YYYY-MM-DD. */
export async function fetchPublicacoes(dia: string, modalidade: number, pagina: number, opts?: FetchOpts) {
  const d = dia.replaceAll("-", "");
  const url = `${CONSULTA_BASE}/contratacoes/publicacao?dataInicial=${d}&dataFinal=${d}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
  return getJson<PncpPage<PncpContratacao>>(url, opts);
}

export async function fetchArquivos(e: Pick<EditalRow, "cnpj" | "ano" | "sequencial">, opts?: FetchOpts) {
  return (await getJson<PncpArquivo[]>(`${PNCP_BASE}/orgaos/${e.cnpj}/compras/${e.ano}/${e.sequencial}/arquivos`, opts)) ?? [];
}

/** Picks the document most likely to be the edital itself. */
export function pickEdital(arquivos: PncpArquivo[]): PncpArquivo | null {
  const ativos = arquivos.filter((a) => a.statusAtivo);
  const score = (a: PncpArquivo) => {
    const t = `${a.tipoDocumentoNome ?? ""} ${a.titulo}`.toLowerCase();
    let s = 0;
    if (/edital/.test(a.tipoDocumentoNome?.toLowerCase() ?? "")) s += 4;
    if (/\bedital\b/.test(t)) s += 2;
    if (/termo de refer|aviso/.test(t)) s += 1;
    if (/anexo|planilha|tabela|errata|ata/.test(t)) s -= 2;
    return s;
  };
  return ativos.sort((a, b) => score(b) - score(a) || a.sequencialDocumento - b.sequencialDocumento)[0] ?? null;
}
