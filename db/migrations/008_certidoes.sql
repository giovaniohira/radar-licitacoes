-- "Certidões em dia": only the validity date of each certificate the company needs to bid (no PDF, no file).
-- Five fixed types (federal, fgts, trabalhista, estadual, municipal), one row each per user, plus free "outra" ones.
create table certidoes (
  id            serial primary key,
  user_id       int  not null references users (id) on delete cascade,
  tipo          text not null check (tipo in ('federal', 'fgts', 'trabalhista', 'estadual', 'municipal', 'outra')),
  nome          text,                     -- only for 'outra' (alvará, atestado, registro...)
  valida_ate    date not null,
  atualizado_em timestamptz not null default now()
);
create unique index certidoes_user_tipo_uq on certidoes (user_id, tipo) where tipo <> 'outra';
create index certidoes_user_idx on certidoes (user_id);

-- One warning per certificate per day, so the e-mail never repeats it if the send runs twice.
create table certidao_avisos (
  certidao_id int  not null references certidoes (id) on delete cascade,
  dia         date not null,
  primary key (certidao_id, dia)
);
