# Radar de Licitações

**Encontre, acompanhe e ganhe licitações públicas.** O Radar lê todo dia o Portal Nacional de Contratações Públicas (PNCP), avisa por e-mail quando sai um edital que combina com a sua empresa, resume o PDF do edital com IA, organiza as propostas num pipeline e mostra quem compra e quem vence no seu mercado.

**No ar:** https://apps.giovaniohira.com/radar · o botão **Ver demo** abre uma conta já montada, sem cadastro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/painel-dark.png">
  <img alt="Visão geral: novos editais dos alertas e prazos da semana" src="docs/painel.png">
</picture>

## O que faz

| | |
|---|---|
| **Buscar** | Busca full-text em português, sem acento, sobre todas as contratações abertas. Filtros de UF, modalidade, valor e prazo; qualquer busca vira alerta com um clique. |
| **Alertas** | Um único e-mail por dia, às 7h, só com editais que você ainda não recebeu. A prévia mostra quantos editais o alerta pegaria antes de salvar. |
| **Resumo por IA** | Claude lê o PDF do edital e devolve objeto, prazos, documentos de habilitação, exclusividade ME/EPP, garantia e pontos de atenção, em saída estruturada validada por Zod. |
| **Pipeline** | Kanban da triagem ao resultado com arrastar e soltar. Cada card tem checklist de habilitação (preenchido a partir do resumo da IA), notas e valor da proposta. Os prazos saem num feed iCalendar para o Google Agenda. |
| **Mercado** | A partir de todos os contratos publicados no PNCP: quem mais compra, quem mais vence, valor por semana, faixa de preço e perfil de cada órgão e fornecedor. |

<table>
<tr>
<td><img alt="Pipeline" src="docs/pipeline.png"></td>
<td><img alt="Mercado" src="docs/mercado.png"></td>
</tr>
<tr>
<td><img alt="Busca" src="docs/busca.png"></td>
<td><img alt="Edital" src="docs/edital.png"></td>
</tr>
</table>

## Arquitetura

```
PNCP /contratacoes ─┐                     ┌─ web (Next.js 16, Partial Prerender)
PNCP /contratos  ───┼─► jobs (scheduler) ─► Postgres ─┤
                    │   06/12/18h editais              └─ e-mail diário (SMTP)
                    │   06h contratos · 07h digest · 04h demo
Claude API ◄────────┴──────────────────────────── resumo do edital sob demanda
```

| Onde | O quê |
|---|---|
| `src/lib/pncp.ts` | Cliente PNCP: retry com backoff, `Retry-After`, normalização de editais e contratos |
| `src/lib/ingest.ts` | Upsert em lote via `jsonb_to_recordset`, idempotente por número de controle |
| `src/lib/search.ts` | Busca com `websearch_to_tsquery` + `unaccent`, SQL 100% parametrizado |
| `src/lib/pipeline.ts` | Cards, ordenação, checklist e o feed `.ics` |
| `src/lib/mercado.ts` | Rankings, série semanal e faixas de valor sobre os contratos |
| `src/lib/summary.ts` | Resumo do edital com Claude, cache por edital e cota diária por usuário |
| `src/app` | Rotas públicas em `(site)` e o app com sidebar em `(app)` |
| `db/migrations` | Schema SQL e migrador próprio (`scripts/migrate.ts`) |

### Decisões

- **Sem dependência de UI.** Design system em CSS puro com tokens (claro e escuro), gráficos em SVG desenhados à mão e arrastar e soltar com a API nativa do HTML.
- **Privacidade.** Contratos com pessoa física são guardados sem CPF e sem nome, inclusive no payload bruto, e nunca entram em rankings.
- **Texto legível.** O PNCP publica quase tudo em CAIXA ALTA; `frase()` e `nome()` convertem para caixa normal mantendo siglas (ME/EPP, UBS, UFs).
- **Datas.** Horários do PNCP chegam sem fuso e são tratados como Brasília; colunas `date` saem do Postgres como texto para não mudar de dia entre fusos.
- **Login sem senha.** Link mágico de uso único, guardado como hash, confirmado por botão para que scanners de e-mail não queimem o token. Sessão em cookie HMAC.

## Rodando localmente

```bash
docker run -d --name radar-pg -e POSTGRES_USER=radar -e POSTGRES_PASSWORD=radar -e POSTGRES_DB=radar -p 5544:5432 postgres:17-alpine
cp .env.example .env.local      # preencha SESSION_SECRET (32+ caracteres)
npm install
npm run db:migrate
npm run ingest -- 2026-10-15                         # editais de um dia (~5 min, rate limit do PNCP)
npm run ingest -- 2026-10-01 2026-10-15 --contratos  # contratos para o Mercado (retoma de onde parou)
npm run dev
```

Sem `SMTP_URL`, os e-mails saem no terminal. Sem `ANTHROPIC_API_KEY`, o resumo por IA fica desativado.

## Testes

```bash
TEST_DATABASE_URL=postgres://radar:radar@localhost:5544/radar_test npm test
```

51 testes: unitários (normalização com dados reais do PNCP, retry, SQL parametrizado, sessão HMAC, casing, dobra de linhas do iCalendar, anonimização de pessoa física) e de integração com Postgres real (upsert idempotente, busca sem acento, ingestão paginada, ordem do pipeline, agregações de mercado e envio único por alerta). O CI roda tipos, lint, testes e build a cada push.

## Deploy

Todo push na `main` que passa no CI builda as imagens `web` e `jobs`, publica no GHCR e faz `docker compose up -d` na VPS em `/opt/radar` com um usuário dedicado, seguido de smoke test. O nginx do host serve `/radar` com o snippet em [`deploy/nginx-location.conf`](deploy/nginx-location.conf). Segredos ficam só no `.env` da VPS.

---

Dados públicos do PNCP. Este projeto não tem vínculo com o governo; confira sempre o edital original.
