import Link from "next/link";
import { cacheLife } from "next/cache";
import { SubmitButton } from "@/components/SubmitButton";
import { editalHref } from "@/components/ui";
import { ehCnpj } from "@/lib/concorrentes";
import { pool } from "@/lib/db";
import { formatBRL, formatDia, frase, nome, tituloCurto } from "@/lib/format";
import { quemGanhou, termosDoObjeto } from "@/lib/quemganhou";
import { seguirForm } from "../../../actions/concorrentes";

// The lookup reads the buyer's contracts through two indexes; on the production database a cold run can take seconds,
// and contracts only change when the 06h ingest runs, so each (buyer, words) result is kept for an hour.
async function buscar(cnpj: string, termos: string[]) {
  "use cache";
  cacheLife("hours");
  return quemGanhou(pool(), cnpj, termos);
}

/** A contract value; PNCP uses 0 for "not informed", which formatBRL would print as "Sigiloso". */
const valor = (v: number | null) => (v && v > 0 ? formatBRL(v) : "—");

/**
 * "Quem já ganhou aqui": up to five contracts the same buyer signed for something similar, with supplier, value and date.
 * Always shown (never hidden when empty), open to visitors without an account.
 */
export async function QuemJaGanhou({ cnpj, objeto, excluir }: { cnpj: string; objeto: string; excluir: string }) {
  const r = await buscar(cnpj, termosDoObjeto(objeto, excluir));
  return (
    <section className="card" aria-labelledby="quemganhou-h" style={{ overflow: "hidden" }}>
      <div className="card-head">
        <h2 id="quemganhou-h">Quem já ganhou aqui</h2>
        <Link className="small" href={`/orgao/${cnpj}`}>
          Ver o órgão
        </Link>
      </div>
      {r.contratos.length === 0 ? (
        <p className="card-body small muted">
          Não achamos contratos parecidos deste órgão no PNCP. Olhamos os contratos publicados desde julho de 2026.
        </p>
      ) : (
        <>
          {r.total >= 2 && r.desde && (
            <p className="card-body small" style={{ paddingBottom: 0 }}>
              <b className="num">{r.total}</b> contratos parecidos desde {formatDia(r.desde)}
              {r.valorMin != null && r.valorMax != null && (
                <>
                  , de <span className="num">{formatBRL(r.valorMin)}</span> a <span className="num">{formatBRL(r.valorMax)}</span>
                </>
              )}
              .
            </p>
          )}
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Fornecedor</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Assinado</th>
                  <th>
                    <span className="sr-only">Edital</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.contratos.map((c) => (
                  <tr key={c.id}>
                    <td style={{ minWidth: 220 }}>{tituloCurto(frase(c.objeto), 100)}</td>
                    <td>
                      {c.fornecedor_ni ? <Link href={`/fornecedor/${c.fornecedor_ni}`}>{nome(c.fornecedor)}</Link> : nome(c.fornecedor)}
                      {c.fornecedor_ni && ehCnpj(c.fornecedor_ni) && (
                        <form action={seguirForm} style={{ marginTop: 4 }}>
                          <input type="hidden" name="ni" value={c.fornecedor_ni} />
                          <SubmitButton className="btn btn-ghost btn-sm" style={{ padding: 0, height: 28 }} aria-label={`Acompanhar ${nome(c.fornecedor)}`}>
                            Acompanhar
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="num nowrap" style={{ textAlign: "right" }}>
                      {valor(c.valor_global)}
                    </td>
                    <td className="num nowrap">{formatDia(c.data_assinatura)}</td>
                    <td className="nowrap">{c.tem_edital && c.compra_id ? <Link href={editalHref(c.compra_id)}>ver edital</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="card-body xs subtle" style={{ paddingTop: 0 }}>
        Valor total do contrato, não preço por item. Fonte: contratos publicados no PNCP.
      </p>
    </section>
  );
}
