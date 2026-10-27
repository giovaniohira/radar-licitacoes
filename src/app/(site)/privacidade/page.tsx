import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Quais dados o Radar de Licitações guarda, para quê, com quem compartilha e como apagar sua conta.",
  alternates: { canonical: "/privacidade" },
};

export default function Privacidade() {
  return (
    <main id="conteudo" className="section container prose" style={{ maxWidth: 720 }}>
      <h1>Política de privacidade</h1>
      <p className="muted">Atualizada em 27 de outubro de 2026.</p>

      <h2>O que guardamos sobre você</h2>
      <ul>
        <li>Seu e-mail, usado para entrar e para mandar os alertas.</li>
        <li>O que você configura no Radar: alertas (palavras, estados, valores), editais no pipeline e o checklist de cada um.</li>
        <li>Um cookie de sessão assinado, que só serve para manter você conectado. Não usamos cookies de propaganda nem rastreadores de terceiros.</li>
      </ul>
      <p>Não pedimos CPF, telefone, senha nem dados de pagamento.</p>

      <h2>Para que usamos</h2>
      <p>
        Só para fazer o Radar funcionar: entrar na sua conta, mandar o e-mail diário com os editais que combinam com seus alertas e mostrar o seu
        pipeline. Não vendemos nem alugamos seus dados e não mandamos propaganda de terceiros. A base legal é a execução do serviço que você pediu
        (LGPD, art. 7º, V).
      </p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>O provedor de envio de e-mail recebe seu endereço para entregar os alertas e os links de acesso.</li>
        <li>
          O resumo por IA manda para a Anthropic apenas o PDF público do edital, baixado do PNCP. Nenhum dado seu vai junto.
        </li>
        <li>Os servidores e o banco de dados ficam em uma máquina contratada por nós, sem acesso de terceiros aos dados.</li>
      </ul>

      <h2>Dados públicos do PNCP</h2>
      <p>
        Editais, órgãos e contratos vêm do Portal Nacional de Contratações Públicas, que é público por lei. Contratos com pessoa física aparecem
        sem nome e sem CPF e nunca entram em rankings. Empresas aparecem com razão social e CNPJ, como no portal oficial.
      </p>

      <h2>Por quanto tempo</h2>
      <p>
        Enquanto sua conta existir. Em <Link href="/conta">Conta</Link> você pode sair de todos os aparelhos ou excluir a conta: isso apaga na hora
        seu e-mail, alertas e pipeline.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Pela LGPD você pode pedir acesso, correção, cópia ou exclusão dos seus dados. A exclusão você mesmo faz em Conta; para o resto, ou para
        qualquer dúvida, fale com a gente pelo{" "}
        <a href="https://github.com/giovaniohira/radar-licitacoes/issues" target="_blank" rel="noreferrer">
          GitHub do projeto
        </a>
        .
      </p>
    </main>
  );
}
