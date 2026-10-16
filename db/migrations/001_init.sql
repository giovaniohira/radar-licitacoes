create extension if not exists unaccent;

-- unaccent() is STABLE; full-text generated columns need an IMMUTABLE wrapper.
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create table editais (
  id                text primary key,            -- numeroControlePNCP
  cnpj              text not null,
  ano               int  not null,
  sequencial        int  not null,
  orgao             text not null,
  unidade           text,
  uf                char(2),
  municipio         text,
  codigo_ibge       text,
  esfera            char(1),
  objeto            text not null,
  info_complementar text,
  modalidade_id     int  not null,
  modalidade        text,
  situacao          text,
  valor_estimado    numeric(18, 2),
  srp               boolean,
  abertura          timestamptz,
  encerramento      timestamptz,
  publicado_em      timestamptz,
  atualizado_em     timestamptz,
  link_origem       text,
  raw               jsonb not null,
  ingerido_em       timestamptz not null default now(),
  busca             tsvector generated always as (
    setweight(to_tsvector('portuguese', f_unaccent(coalesce(objeto, ''))), 'A') ||
    setweight(to_tsvector('portuguese', f_unaccent(coalesce(info_complementar, ''))), 'B') ||
    setweight(to_tsvector('portuguese', f_unaccent(orgao)), 'C')
  ) stored
);

create index editais_busca_idx on editais using gin (busca);
create index editais_encerramento_idx on editais (encerramento);
create index editais_publicado_idx on editais (publicado_em);
create index editais_uf_idx on editais (uf);
create index editais_ingerido_idx on editais (ingerido_em);

create table ingest_runs (
  dia           date not null,
  modalidade_id int  not null,
  paginas       int  not null,
  registros     int  not null,
  finalizado_em timestamptz not null default now(),
  primary key (dia, modalidade_id)
);

create table users (
  id         serial primary key,
  email      text not null unique,
  criado_em  timestamptz not null default now()
);

create table login_tokens (
  token_hash text primary key,
  user_id    int not null references users (id) on delete cascade,
  expira_em  timestamptz not null,
  usado_em   timestamptz
);

create table alerts (
  id            serial primary key,
  user_id       int  not null references users (id) on delete cascade,
  nome          text not null,
  palavras      text not null,
  ufs           text[] not null default '{}',
  modalidades   int[]  not null default '{}',
  valor_min     numeric(18, 2),
  valor_max     numeric(18, 2),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create index alerts_user_idx on alerts (user_id);

-- Which editais already went out in a digest, so each one is sent once per alert.
create table alert_envios (
  alert_id  int  not null references alerts (id) on delete cascade,
  edital_id text not null references editais (id) on delete cascade,
  enviado_em timestamptz not null default now(),
  primary key (alert_id, edital_id)
);

create table acompanhamentos (
  user_id       int  not null references users (id) on delete cascade,
  edital_id     text not null references editais (id) on delete cascade,
  status        text not null check (status in ('interesse', 'preparando', 'enviada', 'descartado')),
  nota          text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, edital_id)
);

create table resumos (
  edital_id  text primary key references editais (id) on delete cascade,
  documento  text not null,
  dados      jsonb not null,
  modelo     text not null,
  criado_em  timestamptz not null default now()
);

create table resumo_uso (
  user_id int  not null references users (id) on delete cascade,
  dia     date not null default current_date,
  total   int  not null default 0,
  primary key (user_id, dia)
);
