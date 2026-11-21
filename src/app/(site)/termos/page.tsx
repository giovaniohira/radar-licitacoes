import type { Metadata } from "next";
import Link from "next/link";
import { DIAS_TESTE, DOCUMENTOS, EMPRESA, PRECO_MENSAL, quemSomos } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "As regras de uso do Vencedital: o serviço, o teste grátis, preço, cancelamento, responsabilidades e seus dados.",
  alternates: { canonical: "/termos" },
};

// Text: docs/empresa/termos-de-uso.md (launch version). Company fields come from lib/empresa and are left out while unknown.
export default function Termos() {
  const { contato } = EMPRESA;
  return (
    <main id="conteudo" className="section container prose" style={{ maxWidth: 720 }}>
      <h1>Termos de Uso do Vencedital</h1>
      <p className="muted">
        Versão {DOCUMENTOS.versao} · {DOCUMENTOS.publicadoEm}.
      </p>

      <h2>1. Quem somos</h2>
      <p>
        O Vencedital é um serviço da {quemSomos()}.{contato && <> Contato: <a href={`mailto:${contato}`}>{contato}</a>.</>} Ao criar a conta ou
        assinar, você aceita estes Termos e a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>2. O serviço</h2>
      <p>
        O Vencedital é um software por assinatura para empresas (inclusive MEI) que vendem ao governo: alertas diários de editais do PNCP, resumo
        do edital por IA, quadro de disputas e painéis de mercado. Não é consultoria nem assessoria.
      </p>

      <h2>3. Informação, não assessoria</h2>
      <ul>
        <li>Os dados vêm do PNCP e podem estar errados, incompletos ou desatualizados.</li>
        <li>
          <strong>O resumo por IA pode ter erros e não substitui a leitura do edital oficial.</strong>
        </li>
        <li>O alerta é um filtro: editais relevantes podem não aparecer.</li>
        <li>Decidir participar, cumprir prazos e reunir documentos é responsabilidade sua. Confira tudo no edital oficial.</li>
        <li>O Vencedital é um serviço privado, sem vínculo com o governo.</li>
      </ul>

      <h2>4. Teste, preço e pagamento</h2>
      <ul>
        <li>
          <strong>Teste grátis de {DIAS_TESTE} dias, sem cartão</strong>, um por empresa. Nada é cobrado sem que você assine.
        </li>
        <li>
          <strong>Preço: R$ {PRECO_MENSAL}/mês</strong>, renovado automaticamente a cada mês até você cancelar. Pagamento por Pix, cartão ou boleto,
          conforme as opções do pagamento. Não guardamos dados de cartão.
        </li>
        <li>Emitimos nota fiscal de serviço para cada pagamento.</li>
        <li>Podemos mudar o preço de tabela com aviso por e-mail de 30 dias. Você pode cancelar antes de a mudança valer.</li>
        <li>
          <strong>Preço de fundador:</strong> os 10 primeiros assinantes pagam <strong>R$ {PRECO_MENSAL}/mês para sempre, sem nenhum reajuste</strong>,
          enquanto a assinatura continuar ativa. Quem cancela e volta depois paga o preço de tabela.
        </li>
        <li>Atraso: depois de 10 dias sem pagamento, o acesso às funções pagas é suspenso; com 30 dias, a assinatura é cancelada.</li>
      </ul>

      <h2>5. Cancelamento e reembolso</h2>
      <ul>
        <li>
          Cancele quando quiser, sem multa
          {contato ? (
            <>
              , por e-mail para <a href={`mailto:${contato}`}>{contato}</a>
            </>
          ) : null}
          .
        </li>
        <li>O acesso vai até o fim do mês pago. Não há devolução proporcional.</li>
        <li>
          <strong>Reembolso de 7 dias:</strong> se desistir em até 7 dias do <strong>primeiro pagamento</strong>, devolvemos 100%.
        </li>
      </ul>

      <h2>6. Sua conta e uso permitido</h2>
      <ul>
        <li>O acesso é por link enviado ao seu e-mail. Quem tiver acesso ao seu e-mail entra na sua conta: proteja-o.</li>
        <li>Um login por pessoa. Não compartilhe a conta.</li>
        <li>Consultorias podem usar o Vencedital no trabalho para os próprios clientes. Revender ou repassar o acesso é proibido.</li>
        <li>É proibido raspar dados com robôs, revender os dados em massa ou burlar os limites do plano (como a cota de resumos por IA).</li>
        <li>Podemos suspender a conta em caso de violação, com aviso.</li>
      </ul>

      <h2>7. Disponibilidade</h2>
      <p>
        Fazemos esforço razoável para manter o serviço no ar, sem garantia de funcionamento contínuo. O serviço depende de terceiros, como o PNCP, o
        provedor de IA e o de e-mail. Falhas deles não são descumprimento nosso.
      </p>

      <h2>8. Limite de responsabilidade</h2>
      <ul>
        <li>
          Não respondemos por perda de prazo, perda de licitação, inabilitação, lucros cessantes ou decisões tomadas sem conferir o edital oficial.
        </li>
        <li>Nossa responsabilidade total fica limitada ao valor que você pagou nos 3 meses anteriores ao problema.</li>
        <li>Isso não vale para dolo ou culpa grave.</li>
      </ul>

      <h2>9. Seus dados</h2>
      <ul>
        <li>
          O que você cria (alertas, disputas, notas) é seu. Você pode pedir uma cópia
          {contato ? (
            <>
              {" "}
              por e-mail para <a href={`mailto:${contato}`}>{contato}</a>
            </>
          ) : null}
          .
        </li>
        <li>
          Você pode excluir a conta em <Link href="/conta">Conta</Link>. Guardamos só o que a lei exige (notas fiscais e registros de acesso), como
          explicado na <Link href="/privacidade">Política de Privacidade</Link>.
        </li>
        <li>
          Avisos de teste, cobrança e nota fiscal são mensagens do serviço. Novidades do produto saem no máximo uma vez por mês, com descadastro em um
          clique, sem desligar o alerta.
        </li>
      </ul>

      <h2>10. Propriedade</h2>
      <p>Os dados do PNCP são públicos e não são nossos. O software, o nome e a marca Vencedital pertencem à {EMPRESA.razaoSocial}</p>

      <h2>11. Mudanças nestes Termos</h2>
      <p>Mudanças relevantes são avisadas por e-mail com 30 dias de antecedência. Se não concordar, você pode cancelar antes de elas valerem.</p>

      <h2>12. Lei e foro</h2>
      <p>
        Lei brasileira.
        {EMPRESA.foro && (
          <>
            {" "}
            Foro da comarca de {EMPRESA.foro}, ressalvado o direito de quem for considerado consumidor de usar o foro do próprio domicílio.
          </>
        )}
      </p>
    </main>
  );
}
