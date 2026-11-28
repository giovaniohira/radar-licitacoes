-- "Quem já ganhou aqui" falls back to other buyers of the same state and sphere.
-- Lets Postgres AND this with the GIN text bitmap instead of reading every national match from the heap.
-- In production it is created by hand first with CREATE INDEX CONCURRENTLY (this runner wraps files in a
-- transaction, and a plain build would block ingest for minutes), so here it is a no-op there.
create index if not exists contratos_uf_esfera_idx on contratos (uf, esfera, data_assinatura);
