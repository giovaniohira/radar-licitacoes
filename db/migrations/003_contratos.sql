-- Signed contracts from PNCP (/v1/contratos): who won, for how much, for which buyer. Feeds market analytics.
create table contratos (
  id               text primary key,             -- numeroControlePNCP of the contract
  compra_id        text,                         -- numeroControlePncpCompra (an editais.id when we ingested it)
  orgao_cnpj       text not null,
  orgao            text not null,
  esfera           char(1),
  uf               char(2),
  municipio        text,
  fornecedor_ni    text,
  fornecedor       text,
  tipo_pessoa      text,
  objeto           text not null,
  categoria        text,
  tipo_contrato    text,
  valor_global     numeric(18, 2),
  data_assinatura  date,
  vigencia_inicio  date,
  vigencia_fim     date,
  publicado_em     timestamptz,
  atualizado_em    timestamptz,
  raw              jsonb not null,
  ingerido_em      timestamptz not null default now(),
  busca            tsvector generated always as (
    setweight(to_tsvector('portuguese', f_unaccent(coalesce(objeto, ''))), 'A') ||
    setweight(to_tsvector('portuguese', f_unaccent(coalesce(categoria, ''))), 'C')
  ) stored
);

create index contratos_busca_idx on contratos using gin (busca);
create index contratos_assinatura_idx on contratos (data_assinatura);
create index contratos_publicado_idx on contratos (publicado_em);
create index contratos_orgao_idx on contratos (orgao_cnpj);
create index contratos_fornecedor_idx on contratos (fornecedor_ni);
create index contratos_compra_idx on contratos (compra_id);
create index editais_cnpj_idx on editais (cnpj);

create table contratos_runs (
  dia           date primary key,
  paginas       int  not null,
  registros     int  not null,
  finalizado_em timestamptz not null default now()
);
