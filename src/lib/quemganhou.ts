import type { Pool } from "pg";

/**
 * "Quem já ganhou aqui": contracts the same buyer (orgao_cnpj) signed for something similar to an open edital.
 * Similar = the contract text shares enough of the edital's distinctive words (see minimoDePalavras), after dropping
 * procurement boilerplate and the buyer's own name. See docs/empresa/spec-quem-ganhou.md.
 */

/** Words that appear in almost every notice and say nothing about what is being bought. */
const GENERICAS = new Set(
  `aquisicao aquisicoes contratacao contratacoes contratar adquirir empresa empresas especializada especializado especializadas
   fornecimento fornecimentos fornecer prestacao servico servicos registro precos preco futura futuras eventual eventuais
   objeto objetos atender atendimento atendimentos necessidade necessidades demanda demandas parcelada parcelado conforme
   termo referencia anexo anexos edital editais destinado destinada destinados destinadas visando atraves mediante
   constantes descritas descritivo descricao processo licitacao licitacoes licitatorio pregao eletronico presencial publica
   publico publicas geral diversos diversas tipo forma demais objetivo objetivando sistema unidade unidades periodo meses anos
   estimado total valor item itens lote lotes sobre entre como solicitacao solicitacoes suprir compras portal licitanet
   compra comprar outros outras demais especificacoes especificacao quantitativos quantitativo estabelecidos estabelecidas condicoes
   condicao administracao necessarios necessaria necessarias incluindo inclusive utilizada utilizado utilizados utilizadas
   realizacao realizar execucao disponibilizacao contratado contratada contrato contratos atuar acordo oferta
   comum comuns continuo continua continuos continuados sob demanda ata saldo remanescente vigencia presente instrumento
   pessoa pessoas juridica juridicas fisica unico unica conjunto grupo setor setores departamento departamentos
   prefeitura camara fundo fundacao secretaria secretarias municipio municipal municipais estadual federal governo
   solucao solucoes integrada integrado informatizada informatizado correlatos correlata despesa referente pagamento
   para pela pelo pelas pelos suas seus esta este essa esse desta deste dessa desse seja sendo serem onde quando apos cada
   toda todo todos todas outro uns umas nao mais menos muito mediante visto devendo deverao dever possui possuir
   capacidade caracteristicas caracteristica planilha projeto projetos contempladas operacionais conveniencia periodicas
   periodicos periodica periodico executivo basico basica especializados tecnicos tecnica tecnicas tecnico elaboracao
   selecao propostas proposta consiste formalizacao convocacao interessados procedimento procedimentos portaria
   credenciamento credenciar credenciada credenciadas credenciado credenciados adesao empenho emergencial emergencia
   preventiva preventivo corretiva corretivo instalacao adequacao finalidade anuencia`
    .split(/\s+/)
    .filter(Boolean),
);

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const palavras = (s: string) => semAcento(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Up to `max` distinctive words of an edital's object, in the order they appear. Only the start of the text is read:
 * that is where the object is stated; the tail is specifications and conditions. `excluir` is text whose words are
 * dropped too (buyer, unit, city), since every contract of the same buyer mentions them.
 */
export function termosDoObjeto(objeto: string, excluir = "", max = 6): string[] {
  const proprios = new Set(palavras(excluir));
  const vistos = new Set<string>();
  for (const w of palavras(objeto.slice(0, 260))) {
    if (w.length < 4 || /\d/.test(w) || GENERICAS.has(w) || proprios.has(w)) continue;
    vistos.add(w);
    if (vistos.size >= max) break;
  }
  return [...vistos];
}

export interface ContratoParecido {
  id: string;
  objeto: string;
  orgao: string;
  municipio: string | null;
  fornecedor: string | null;
  fornecedor_ni: string | null;
  valor_global: number | null;
  data_assinatura: string | null;
  compra_id: string | null;
  tem_edital: boolean;
}

export interface QuemGanhou {
  contratos: ContratoParecido[];
  /** How many similar contracts the buyer has in total (the list shows at most `limite`). */
  total: number;
  desde: string | null;
  valorMin: number | null;
  valorMax: number | null;
}

export const LIMITE_QUEM_GANHOU = 5;

/**
 * Words a contract must share with the edital: at least two (the one word when the edital has just one) and at least
 * a third of them, so a long object cannot be matched by a few generic words. On top of that, one of the first
 * `PALAVRAS_DO_OBJETO` words must match: they say what is bought, while the rest is often a place or a unit name.
 * A stricter rule only means more "não achamos".
 */
export const minimoDePalavras = (n: number) => (n <= 1 ? n : Math.max(2, Math.ceil(n / 3)));
export const PALAVRAS_DO_OBJETO = 2;

/**
 * tsquery for the GIN index: a necessary condition for a contract to be accepted, so the index can narrow the buyer's
 * rows. A contract needs at least two words, one of them from the head, so it must contain a pair (head word, other word)
 * together. Pairs in AND are far more selective than the plain OR of all words, which for a common word such as
 * "equipamentos" pulls tens of thousands of contracts from every buyer in Brazil before the buyer filter applies.
 */
export function prefiltroGin(termos: string[]): string {
  if (termos.length === 0) return "";
  if (minimoDePalavras(termos.length) !== 2) return termos.join(" | ");
  const pares: string[] = [];
  termos.slice(0, PALAVRAS_DO_OBJETO).forEach((h, i) => {
    termos.forEach((x, j) => {
      if (j !== i && !(j < PALAVRAS_DO_OBJETO && j < i)) pares.push(`(${h} & ${x})`);
    });
  });
  return pares.join(" | ");
}

/**
 * $2 words, $3 minimum words, $4 list size, $5 how many leading words count as the object, $6 index prefilter (prefiltroGin).
 * `onde` picks whose contracts are read: the buyer ($1 CNPJ), or other buyers of the same state and sphere (see quemGanhouNaUf).
 */
export const sqlQuemGanhou = (onde: string) => `with q as (select to_tsquery('portuguese', f_unaccent(t)) as tq, n from unnest($2::text[]) with ordinality as u(t, n)),
          m as (
            select k.id, k.objeto, k.orgao, k.municipio, k.fornecedor, k.fornecedor_ni, k.valor_global, k.data_assinatura, k.compra_id,
                   (select count(*) from q where k.busca @@ q.tq) as acertos,
                   (select count(*) from q where q.n <= $5 and k.busca @@ q.tq) as da_cabeca
            from contratos k
            where ${onde} and k.tipo_pessoa <> 'PF' and k.fornecedor is not null
              and k.busca @@ to_tsquery('portuguese', $6)
          ),
          -- Only contracts within one word of the best match: a buyer with a close match should not also list loose ones.
          ok as (
            select * from m where acertos >= $3 and da_cabeca >= 1
              and acertos >= (select max(acertos) from m where acertos >= $3 and da_cabeca >= 1) - 1
          ),
          s as (
            select count(*) as total, min(data_assinatura)::text as desde,
                   (min(valor_global) filter (where valor_global > 0))::float8 as vmin,
                   (max(valor_global) filter (where valor_global > 0))::float8 as vmax
            from ok
          ),
          top as (
            select * from ok order by acertos desc, data_assinatura desc nulls last, valor_global desc nulls last limit $4
          )
     select top.id, top.objeto, top.orgao, top.municipio, top.fornecedor, top.fornecedor_ni, top.valor_global::float8 as valor_global,
            top.data_assinatura::text as data_assinatura, top.compra_id,
            exists (select 1 from editais e where e.id = top.compra_id) as tem_edital,
            s.total, s.desde, s.vmin, s.vmax
     from s left join top on true
     order by top.data_assinatura desc nulls last, top.valor_global desc nulls last`;

const SQL_DO_ORGAO = sqlQuemGanhou("k.orgao_cnpj = $1");
// Other buyers of the same state and sphere, last 24 months: $1 UF, $7 esfera, $8 the buyer itself (already looked at).
const SQL_DA_UF = sqlQuemGanhou(
  "k.uf = $1 and k.esfera = $7 and k.orgao_cnpj <> $8 and k.data_assinatura >= current_date - interval '24 months'",
);

async function rodar(db: Pool, sql: string, primeiro: string, termos: string[], limite: number, extra: string[] = []): Promise<QuemGanhou> {
  const vazio: QuemGanhou = { contratos: [], total: 0, desde: null, valorMin: null, valorMax: null };
  if (!termos.length) return vazio;
  // Each word goes through the same Portuguese stemming as the index (f_unaccent + 'portuguese'), one tsquery per word.
  const { rows } = await db.query<ContratoParecido & { total: string; desde: string | null; vmin: number | null; vmax: number | null }>(sql, [
    primeiro,
    termos,
    minimoDePalavras(termos.length),
    limite,
    PALAVRAS_DO_OBJETO,
    prefiltroGin(termos),
    ...extra,
  ]);
  const s = rows[0];
  if (!s || Number(s.total) === 0) return vazio;
  return {
    contratos: rows
      .filter((r) => r.id)
      .map((r) => ({
        id: r.id,
        objeto: r.objeto,
        orgao: r.orgao,
        municipio: r.municipio,
        fornecedor: r.fornecedor,
        fornecedor_ni: r.fornecedor_ni,
        valor_global: r.valor_global,
        data_assinatura: r.data_assinatura,
        compra_id: r.compra_id,
        tem_edital: r.tem_edital,
      })),
    total: Number(s.total),
    desde: s.desde,
    valorMin: s.vmin,
    valorMax: s.vmax,
  };
}

export const quemGanhou = (db: Pool, cnpj: string, termos: string[], limite = LIMITE_QUEM_GANHOU) =>
  rodar(db, SQL_DO_ORGAO, cnpj, termos, limite);

/** The same search over the other buyers of the edital's state and sphere (municipal, state, federal), for a buyer with too little history. */
export const quemGanhouNaUf = (db: Pool, uf: string, esfera: string, excluirCnpj: string, termos: string[], limite = LIMITE_QUEM_GANHOU) =>
  rodar(db, SQL_DA_UF, uf, termos, limite, [esfera, excluirCnpj]);

/** Below this many similar contracts of the buyer itself, the section shows the state's other buyers instead. */
export const MINIMO_DO_ORGAO = 2;

/** Publication date of the oldest contract we hold, so the empty state says how far back we really look. */
export async function contratoMaisAntigo(db: Pool): Promise<string | null> {
  const { rows } = await db.query<{ d: string | null }>(`select min(publicado_em)::text as d from contratos`);
  return rows[0]?.d ?? null;
}
