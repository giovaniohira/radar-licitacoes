-- "Acompanhar concorrente": the companies (CNPJ only, never individuals) a user follows; their new contracts go in the 7h e-mail.
create table concorrentes (
  user_id       int  not null references users (id) on delete cascade,
  fornecedor_ni text not null check (fornecedor_ni ~ '^[0-9]{14}$'),
  nome          text,                              -- as in the contracts when the user started to follow
  criado_em     timestamptz not null default now(),
  primary key (user_id, fornecedor_ni)
);

-- Each contract of a followed company shows once per user, in the e-mail that carried it (or counted in its "and N more").
create table concorrente_envios (
  user_id     int  not null references users (id) on delete cascade,
  contrato_id text not null references contratos (id) on delete cascade,
  enviado_em  timestamptz not null default now(),
  primary key (user_id, contrato_id)
);
