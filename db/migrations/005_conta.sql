-- The shared demo account is gone: drop it (cascades to its pipeline and alerts) and the flag.
delete from users where demo;
alter table users drop column demo;

-- "Sair de todos os dispositivos": sessions issued before this instant are rejected.
alter table users add column sessoes_desde timestamptz;

-- A login token that also moves the account to a new address (e-mail change, confirmed from the new inbox).
alter table login_tokens add column email_novo text;
