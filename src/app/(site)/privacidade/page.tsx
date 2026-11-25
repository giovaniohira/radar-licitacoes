import type { Metadata } from "next";
import Link from "next/link";
import { DOCUMENTOS, EMPRESA, quemSomos } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Quais dados o Vencedital guarda, para quê, com quem compartilha, por quanto tempo e como apagar sua conta.",
  alternates: { canonical: "/privacidade" },
};

const GUARDAMOS = [
  [
    "E-mail, CNPJ da empresa, senha (guardada só como hash, que não dá para reverter), alertas, disputas, checklists e notas",
    "Fazer o serviço funcionar: login, alerta diário, quadro de disputas",
    "Execução de contrato (art. 7º, V)",
  ],
  ["Se você assinar: razão social, CNPJ, endereço fiscal e histórico de pagamentos", "Cobrar e emitir nota fiscal", "Contrato e obrigação legal (art. 7º, V e II)"],
  ["Registros de acesso (IP, data, hora)", "Exigência do Marco Civil da Internet (art. 15)", "Obrigação legal (art. 7º, II)"],
  ["Dados técnicos de uso", "Segurança e prevenção de abuso", "Legítimo interesse (art. 7º, IX)"],
  ["E-mail", "Novidades do produto, no máximo 1 por mês, com descadastro em um clique", "Legítimo interesse (art. 7º, IX)"],
];

const PRESTADORES = [
  ["Hostinger", "Servidor e banco de dados", "Brasil (São Paulo)"],
  ["Resend", "Envio de e-mails", "Estados Unidos, com envio pela região de São Paulo"],
  ["Anthropic", "Resumo por IA: recebe só o PDF público do edital, sem dados da sua conta", "Estados Unidos"],
  ["Contador", "Obrigações fiscais", "Brasil"],
];

// Text: docs/empresa/privacidade-revisada.md (launch version). Company fields come from lib/empresa and are left out while unknown.
export default function Privacidade() {
  const canal = EMPRESA.privacidade;
  return (
    <main id="conteudo" className="section container prose" style={{ maxWidth: 760 }}>
      <h1>Política de Privacidade do Vencedital</h1>
      <p className="muted">Atualizada em {DOCUMENTOS.publicadoEm}.</p>

      <h2>Quem cuida dos seus dados</h2>
      <p>
        <strong>{quemSomos()}</strong>.
        {canal && (
          <>
            {" "}
            Dúvidas e pedidos sobre seus dados: <a href={`mailto:${canal}`}>{canal}</a>. O canal é privado.
          </>
        )}
      </p>

      <h2>O que guardamos e por quê</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Dado</th>
              <th>Para quê</th>
              <th>Base legal (LGPD)</th>
            </tr>
          </thead>
          <tbody>
            {GUARDAMOS.map(([d, p, b]) => (
              <tr key={d}>
                <td>{d}</td>
                <td>{p}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>Dados de cartão</strong>, quando houver assinatura paga, são digitados no ambiente do processador de pagamento. Não recebemos nem
        guardamos o número do cartão.
      </p>
      <p>
        Usamos só um cookie, de sessão, para manter você conectado. Sem cookies de propaganda nem rastreadores de terceiros. Não vendemos seus dados.
      </p>

      <h2>Com quem compartilhamos</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Prestador</th>
              <th>Para quê</th>
              <th>Onde</th>
            </tr>
          </thead>
          <tbody>
            {PRESTADORES.map(([n, p, o]) => (
              <tr key={n}>
                <td>{n}</td>
                <td>{p}</td>
                <td>{o}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        O envio à Anthropic e ao provedor de e-mail, que ficam fora do Brasil, é uma transferência internacional de dados (LGPD, art. 33), feita
        para prestar o serviço que você contratou.
      </p>

      <h2>Dados públicos do PNCP</h2>
      <p>Editais e contratos vêm do PNCP, que é público. Contratos com pessoa física aparecem sem nome e sem CPF.</p>

      <h2>Por quanto tempo</h2>
      <ul>
        <li>Dados da conta: enquanto a conta existir.</li>
        <li>Registros de acesso: 6 meses.</li>
        <li>Notas fiscais e dados de cobrança: 5 anos, por obrigação fiscal.</li>
        {EMPRESA.backupDias && <li>Backup: até {EMPRESA.backupDias} dias.</li>}
      </ul>

      <h2>Excluir a conta</h2>
      <p>
        Em <Link href="/conta">Conta</Link> você exclui a conta na hora: e-mail, alertas, disputas e notas são apagados. Ficam só os registros de
        acesso (até completar 6 meses), as notas fiscais (5 anos) e o backup (até ser sobrescrito).
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, cópia ou exclusão dos seus dados, e se opor a usos baseados em legítimo interesse.
        {canal && (
          <>
            {" "}
            Escreva para <a href={`mailto:${canal}`}>{canal}</a> a partir do e-mail da conta. Respondemos em até 15 dias.
          </>
        )}{" "}
        Você também pode reclamar à ANPD.
      </p>

      <h2>Link de agenda</h2>
      <p>O link de agenda (.ics) mostra os prazos das suas disputas a quem tiver o link. Não o compartilhe.</p>

      <h2>Segurança</h2>
      <p>
        Usamos HTTPS, login por link de uso único e acesso restrito ao servidor. Se houver um vazamento que traga risco a você, avisamos você e a
        ANPD.
      </p>

      <h2>E-mail comercial</h2>
      <p>
        Podemos mandar um e-mail, e no máximo um lembrete, a empresas com contratos no PNCP, usando o contato do cadastro público de CNPJ da Receita
        Federal. Para sair, use o link do e-mail ou responda &quot;sair&quot;, e não escrevemos de novo.
      </p>

      <h2>Mudanças</h2>
      <p>
        Mudanças relevantes são avisadas por e-mail. Esta política faz parte dos <Link href="/termos">Termos de Uso</Link>.
      </p>
    </main>
  );
}
