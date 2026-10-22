-- First-login setup (/boas-vindas): null until the user finishes or skips it. Accounts that predate it count as done.
alter table users add column onboarding_em timestamptz;
update users set onboarding_em = criado_em;
