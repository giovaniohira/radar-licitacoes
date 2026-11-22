-- "Radar de recompra": contracts that end in 30 to 90 days, found from the words/UFs/value range of the user's own alerts.

-- The lookup filters on vigencia_fim first. Without this index it reads the whole contracts table (minutes on the
-- production copy). Building it blocks writes to contratos for the length of the build (reads keep working).
create index contratos_vigencia_fim_idx on contratos (vigencia_fim);

-- Each contract is shown once per user, in the e-mail that carried it (like alert_envios, but per user: two alerts of
-- the same user can find the same contract). Also what the "Recompras à vista" card on /painel lists.
create table recompra_envios (
  user_id     int  not null references users (id) on delete cascade,
  contrato_id text not null references contratos (id) on delete cascade,
  enviado_em  timestamptz not null default now(),
  -- The user is the supplier of this contract ("Seu contrato com ... termina em ...").
  proprio     boolean not null default false,
  primary key (user_id, contrato_id)
);
create index recompra_envios_user_idx on recompra_envios (user_id, enviado_em desc);
