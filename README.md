# Radar de Licitações

Alertas diários de editais públicos para pequenas empresas. O Radar ingere todo dia a API pública do **PNCP** (Portal Nacional de Contratações Públicas), cruza as licitações com os alertas de cada empresa (palavras-chave, setor, UF, modalidade e faixa de valor) e manda um único e-mail com o que é novo. Para cada edital, a IA lê o PDF e resume objeto, prazos, habilitação, exclusividade ME/EPP e pontos de atenção.

![demo](docs/demo.gif)

## Por quê

Pequenas empresas perdem edital porque não dá para abrir o portal todo dia. As ferramentas que existem são caras e genéricas. O PNCP centraliza desde 2023 as contratações da Lei 14.133 de todos os entes, e a API de consulta é pública e sem chave.

## Funcionalidades

- **Ingestão diária** de todas as modalidades competitivas (pregão, concorrência, dispensa, credenciamento, leilão...). É paginada, com retry e backoff exponencial, respeita `Retry-After` e faz upsert idempotente por `numeroControlePNCP`.
- **Busca full-text em português** sem acento (`unaccent` + `tsvector` com pesos: objeto > informação complementar > órgão). A sintaxe é amigável: vírgula separa alternativas, `-palavra` exclui e aspas marcam frase.
- **Alertas** com presets de setor (mapeados para CNAE, já que o PNCP não traz CNAE), UFs, modalidades e faixa de valor. É um digest diário por usuário, e cada edital vai uma única vez por alerta (`alert_envios`).
- **Painel de acompanhamento:** marque o edital como em análise, preparando, enviada ou descartado e veja os prazos ordenados.
- **Resumo por IA** (Claude, com saída estruturada validada por Zod): escolhe o documento principal do edital, valida que é PDF e tem até 25 MB, guarda o resultado em cache por edital e tem cota diária por usuário.
- **Login sem senha** por link mágico. O token é de uso único e fica guardado como hash; a confirmação é por botão, para que scanners de e-mail não queimem o link. A sessão é um cookie HMAC.

## Arquitetura

```
PNCP API ──► scripts/scheduler.ts (container jobs)
               ├─ 06h/12h/18h  ingestDia() ──► Postgres (editais, tsvector GIN)
               └─ 07h          sendDigests() ──► SMTP
Next.js 16 (container web) ──► busca, painel, edital, resumo IA (Claude)
```

| Pasta | O que tem |
|---|---|
| `src/lib/pncp.ts` | Cliente PNCP: tipos, retry/rate limit, normalização e escolha do PDF do edital |
| `src/lib/ingest.ts` | Upsert em lote via `jsonb_to_recordset` e ingestão por dia/modalidade |
| `src/lib/search.ts` | Monta SQL 100% parametrizado com ranking |
| `src/lib/alerts.ts` | Matching, digest HTML/texto e deduplicação |
| `src/lib/summary.ts` | Resumo do edital com Claude (PDF base64 + structured output + fallback) |
| `db/migrations` | Schema SQL e migrador próprio (`scripts/migrate.ts`) |

## Rodando localmente

```bash
docker run -d --name radar-pg -e POSTGRES_USER=radar -e POSTGRES_PASSWORD=radar -e POSTGRES_DB=radar -p 5544:5432 postgres:17-alpine
cp .env.example .env.local      # preencha SESSION_SECRET (32+ caracteres)
npm install
npm run db:migrate
npm run ingest -- 2026-10-15    # um dia do PNCP (~5 min por causa do rate limit)
npm run dev
npm run alerts:send             # sem SMTP_URL, os e-mails saem no terminal
```

## Testes

```bash
TEST_DATABASE_URL=postgres://radar:radar@localhost:5544/radar_test npm test
```

São 33 testes: unitários (normalização com dados reais do PNCP, retry, SQL parametrizado, sessão HMAC, formatação de prazos, escape do digest, cliente Claude mockado) e de integração com Postgres real (upsert idempotente, busca sem acento, ingestão paginada e envio único por alerta). O CI roda tipos, lint, testes e build a cada push.

## Deploy

`docker compose up -d` sobe `db`, `jobs` (migra e agenda) e `web` (Next standalone em `127.0.0.1:3200`, atrás do nginx). O conjunto usa cerca de 170 MB de RAM.

## Monetização (planejada)

Durante o beta é gratuito. Depois, assinatura B2B de R$ 49 a R$ 199 por mês, com limite de alertas, usuários e resumos por IA.

---

Dados do PNCP, que são públicos. Este projeto não tem vínculo com o governo; confira sempre o edital original.
