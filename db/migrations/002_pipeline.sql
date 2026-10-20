-- v2: the "acompanhamentos" status list becomes a proposal pipeline with stages, ordering, checklist and notes.
alter table users add column demo boolean not null default false;

alter table acompanhamentos rename to pipeline;
alter table pipeline add column etapa text;
update pipeline set etapa = case status
  when 'interesse' then 'analise'
  when 'preparando' then 'preparando'
  when 'enviada' then 'enviada'
  else 'descartada' end;
alter table pipeline drop column status;
alter table pipeline
  alter column etapa set not null,
  alter column etapa set default 'triagem',
  add constraint pipeline_etapa_check
    check (etapa in ('triagem', 'analise', 'preparando', 'enviada', 'ganha', 'perdida', 'descartada')),
  add column posicao int not null default 0,
  add column valor_proposta numeric(18, 2),
  add column criado_em timestamptz not null default now();
alter table pipeline rename column nota to resumo_interno;

create index pipeline_user_etapa_idx on pipeline (user_id, etapa, posicao);

create table pipeline_checklist (
  id        serial primary key,
  user_id   int  not null,
  edital_id text not null,
  texto     text not null,
  feito     boolean not null default false,
  ordem     int not null default 0,
  foreign key (user_id, edital_id) references pipeline (user_id, edital_id) on delete cascade
);
create index pipeline_checklist_idx on pipeline_checklist (user_id, edital_id, ordem);

create table pipeline_notas (
  id        serial primary key,
  user_id   int  not null,
  edital_id text not null,
  texto     text not null,
  criado_em timestamptz not null default now(),
  foreign key (user_id, edital_id) references pipeline (user_id, edital_id) on delete cascade
);
create index pipeline_notas_idx on pipeline_notas (user_id, edital_id, criado_em);
