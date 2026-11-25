-- Accounts with a password (e-mail or CNPJ + senha). Magic links keep working; nothing is deleted.
alter table users
  add column senha_hash text,            -- null: link-only account
  add column cnpj text unique,           -- 14 chars, no punctuation, check digits validated in the app
  add column email_verificado_em timestamptz;

-- An address is verified once someone opened a link sent to it. Accounts that never did stay unverified.
update users u set email_verificado_em = t.primeiro
from (select user_id, min(usado_em) as primeiro from login_tokens where usado_em is not null group by user_id) t
where t.user_id = u.id;

-- What a token does: sign in, confirm a new account, reset the password, or move the account to a new address.
alter table login_tokens add column tipo text not null default 'login';
update login_tokens set tipo = 'email' where email_novo is not null;
alter table login_tokens add constraint login_tokens_tipo_check check (tipo in ('login', 'verificar', 'senha', 'email'));
-- Links now live 20 min to 24 h, so the "3 e-mails per 5 minutes" limit counts by creation time.
alter table login_tokens add column criado_em timestamptz not null default now();
create index login_tokens_user_idx on login_tokens (user_id, expira_em);

-- Failed password sign-ins, for the lockout. Key is "id:<e-mail or CNPJ>" or "ip:<address>". Rows older than a day are pruned.
create table tentativas_login (
  chave text not null,
  em    timestamptz not null default now()
);
create index tentativas_login_idx on tentativas_login (chave, em);
