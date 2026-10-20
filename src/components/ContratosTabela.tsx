import Link from "next/link";
import { formatBRL, formatDia, frase, local, nome } from "@/lib/format";
import type { ContratoLinha } from "@/lib/mercado";
import { editalHref } from "./ui";

export function ContratosTabela({ rows, ocultar }: { rows: ContratoLinha[]; ocultar?: "orgao" | "fornecedor" }) {
  if (!rows.length) return <div className="card-body small muted">Nenhum contrato no período.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Objeto</th>
            {ocultar !== "orgao" && <th>Órgão</th>}
            {ocultar !== "fornecedor" && <th>Fornecedor</th>}
            <th className="r">Valor</th>
            <th>Assinatura</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td style={{ maxWidth: 420 }}>
                {c.tem_edital && c.compra_id ? (
                  <Link className="title clamp2" href={editalHref(c.compra_id)}>
                    {frase(c.objeto)}
                  </Link>
                ) : (
                  <span className="clamp2">{frase(c.objeto)}</span>
                )}
              </td>
              {ocultar !== "orgao" && (
                <td style={{ maxWidth: 240 }}>
                  <Link className="title clamp2" href={`/orgao/${c.orgao_cnpj}`}>
                    {nome(c.orgao)}
                  </Link>
                  <div className="sub">{local(c.municipio, c.uf)}</div>
                </td>
              )}
              {ocultar !== "fornecedor" && (
                <td style={{ maxWidth: 240 }}>
                  {c.fornecedor_ni ? (
                    <Link className="title clamp2" href={`/fornecedor/${c.fornecedor_ni}`}>
                      {nome(c.fornecedor)}
                    </Link>
                  ) : (
                    <span className="muted">{c.fornecedor ?? "—"}</span>
                  )}
                </td>
              )}
              <td className="r num nowrap">{formatBRL(c.valor_global)}</td>
              <td className="num nowrap">{formatDia(c.data_assinatura)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
