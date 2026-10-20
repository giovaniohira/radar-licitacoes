import type { Pool } from "pg";
import type { Etapa } from "./pipeline";

export const DEMO_EMAIL = "demo@radar.local";

// The usual Lei 14.133 habilitação documents, used when a card has no AI summary to seed from.
export const CHECKLIST_PADRAO = [
  "Contrato social e últimas alterações",
  "Certidão conjunta Receita Federal/PGFN",
  "Certificado de regularidade do FGTS (CRF)",
  "Certidão negativa de débitos trabalhistas (CNDT)",
  "Certidões estadual e municipal",
  "Atestado de capacidade técnica",
  "Balanço patrimonial do último exercício",
  "Declaração de enquadramento ME/EPP",
];

const PLANO: { etapa: Etapa; n: number; abertos: boolean; feitos: number }[] = [
  { etapa: "triagem", n: 4, abertos: true, feitos: 0 },
  { etapa: "analise", n: 3, abertos: true, feitos: 2 },
  { etapa: "preparando", n: 3, abertos: true, feitos: 5 },
  { etapa: "enviada", n: 2, abertos: true, feitos: 8 },
  { etapa: "ganha", n: 1, abertos: false, feitos: 8 },
  { etapa: "perdida", n: 1, abertos: false, feitos: 8 },
];

export async function ensureDemoUser(db: Pool): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `insert into users (email, demo) values ($1, true) on conflict (email) do update set demo = true returning id`,
    [DEMO_EMAIL],
  );
  return rows[0].id;
}

/** Wipes and rebuilds the demo account from real editais: an IT supplier with a pipeline and two alerts. */
export async function seedDemo(db: Pool): Promise<number> {
  const userId = await ensureDemoUser(db);
  await db.query(`delete from pipeline where user_id = $1`, [userId]);
  await db.query(`delete from alerts where user_id = $1`, [userId]);

  const usados: string[] = [];
  for (const p of PLANO) {
    const { rows } = await db.query<{ id: string }>(
      `select id from editais
       where busca @@ websearch_to_tsquery('portuguese', f_unaccent('computador or notebook or software or impressora or informatica'))
         and valor_estimado between 5000 and 2000000
         and ${p.abertos ? "encerramento between now() + interval '1 day' and now() + interval '30 days'" : "encerramento between now() - interval '60 days' and now()"}
         and id <> all($1::text[])
       -- md5 spreads the picks across deadlines and buyers but stays stable within a day
       order by md5(id || current_date::text)
       limit $2`,
      [usados, p.n],
    );
    for (const [i, { id }] of rows.entries()) {
      usados.push(id);
      await db.query(
        `insert into pipeline (user_id, edital_id, etapa, posicao, valor_proposta) values ($1, $2, $3, $4,
           case when $3 in ('enviada', 'ganha', 'perdida') then (select round(valor_estimado * 0.88, 2) from editais where id = $2) end)`,
        [userId, id, p.etapa, i],
      );
      await db.query(
        `insert into pipeline_checklist (user_id, edital_id, texto, ordem, feito)
         select $1, $2, t.texto, t.ordem, t.ordem <= $4 from unnest($3::text[]) with ordinality as t(texto, ordem)`,
        [userId, id, CHECKLIST_PADRAO, p.feitos],
      );
    }
  }
  if (usados[4]) {
    await db.query(`insert into pipeline_notas (user_id, edital_id, texto) values ($1, $2, $3), ($1, $2, $4)`, [
      userId,
      usados[4],
      "Ligar para o setor de compras e confirmar se aceitam marca equivalente.",
      "Fornecedor confirmou prazo de entrega de 15 dias.",
    ]);
  }
  await db.query(
    `insert into alerts (user_id, nome, palavras, ufs, valor_max) values
       ($1, 'Informática no Sul e Sudeste', 'computador, notebook, impressora, licença de software', '{PR,SC,RS,SP}', 500000),
       ($1, 'Suporte de TI', 'suporte técnico de informática, manutenção de computadores', '{}', null)`,
    [userId],
  );
  return userId;
}
