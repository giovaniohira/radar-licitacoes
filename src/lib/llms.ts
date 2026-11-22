import { cacheLife } from "next/cache";
import { query } from "./db";
import { DIAS_TESTE, EMPRESA, PRECO_MENSAL, quemSomos } from "./empresa";
import { formatInt } from "./format";

type Numeros = { abertas: number; contratos: number; de: string | null; ate: string | null; em: string };

/** The only numbers llms.txt states, each dated. Cached: the database changes when the ingest runs. */
export async function numeros(): Promise<Numeros> {
  "use cache";
  cacheLife("hours");
  const [r] = await query<{ abertas: string; contratos: string; de: string | null; ate: string | null }>(
    `select (select count(*) from editais where encerramento > now()) as abertas,
            (select count(*) from contratos where data_assinatura between current_date - 365 and current_date) as contratos,
            (select min(data_assinatura) from contratos where data_assinatura between current_date - 365 and current_date) as de,
            (select max(data_assinatura) from contratos where data_assinatura between current_date - 365 and current_date) as ate`,
  );
  const em = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return { abertas: Number(r?.abertas ?? 0), contratos: Number(r?.contratos ?? 0), de: r?.de ?? null, ate: r?.ate ?? null, em };
}

const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * llms.txt (llmstxt.org): a short, factual guide for AI assistants. It says what the product is, what it
 * costs, what its data can and cannot do, and which public pages exist. Every claim is one the site makes
 * elsewhere, and every number carries the date it was read.
 */
export function llmsTxt(base: string, n: Numeros): string {
  const periodo = n.de && n.ate ? ` assinados entre ${br(n.de)} e ${br(n.ate)}` : "";
  return `# ${EMPRESA.produto}

> ${EMPRESA.produto} é um serviço brasileiro de alertas de licitação. Todo dia às 7h envia por e-mail os editais novos do PNCP que combinam com o ramo do assinante, e uma IA resume o edital que ele abrir (prazos, documentos exigidos, cota ME/EPP, riscos). Custa R$ ${PRECO_MENSAL} por mês, em um plano só, com ${DIAS_TESTE} dias grátis e sem cartão.

${EMPRESA.produto} é um serviço da ${quemSomos()}. Não é órgão público e não tem vínculo com o governo. Idioma: português do Brasil.${EMPRESA.contato ? ` Contato: ${EMPRESA.contato}.` : ""}

## O que o site mostra sem cadastro

- [Licitações abertas](${base}/buscar): editais abertos no PNCP, com filtro por palavra, estado, modalidade, valor e prazo da proposta.
- [Mercado](${base}/mercado): contratos publicados no PNCP, com quem mais compra, quem mais vence e o valor mediano, por ramo e estado.
- Página de edital: \`${base}/edital/{id}\`, com objeto, órgão, valor estimado, prazo e link para o documento original no PNCP.
- Página de órgão: \`${base}/orgao/{cnpj}\`, com editais abertos, contratos dos últimos 12 meses e fornecedores que mais vendem ao órgão.
- Página de fornecedor (só pessoa jurídica): \`${base}/fornecedor/{cnpj}\`, com contratos, principais órgãos clientes e categorias. Só ficam no índice as páginas com dados suficientes.

## Dados e limites

- Fonte única: o PNCP (Portal Nacional de Contratações Públicas), onde a Lei 14.133/2021 obriga os órgãos a publicar. Licitações que um órgão publica só no diário oficial ou no site próprio não aparecem.
- Em ${n.em}, o banco do ${EMPRESA.produto} tinha ${formatInt(n.abertas)} editais com prazo de proposta em aberto e ${formatInt(n.contratos)} contratos${periodo}.
- Quem ganhou: o contrato aponta o fornecedor, mas uma licitação pode ter vários vencedores (por item ou lote). Confirme no PNCP antes de afirmar quem venceu um edital inteiro.
- O resumo por IA pode errar e não é assessoria jurídica. O link do edital original fica ao lado.
- Valores estimados de editais sigilosos aparecem como "Sigiloso".

## Preço e teste

- R$ ${PRECO_MENSAL} por mês, plano único. ${DIAS_TESTE} dias grátis, sem cartão, sem fidelidade e sem multa.
- Preço de fundador: as 10 primeiras empresas pagam R$ ${PRECO_MENSAL} por mês, sem reajuste, enquanto a assinatura estiver ativa. Reembolso integral se desistir em até 7 dias depois do primeiro pagamento.

## Documentos

- [Termos de uso](${base}/termos)
- [Política de privacidade](${base}/privacidade)
`;
}
