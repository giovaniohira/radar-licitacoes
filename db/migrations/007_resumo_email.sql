-- AI summaries that the 06h job generates for the daily e-mail are not charged to any user (resumo_uso).
-- They count here instead, per day, against one global cap (RESUMO_EMAIL_TETO_DIARIO).
create table resumo_job_uso (
  dia   date primary key default current_date,
  total int  not null default 0
);
