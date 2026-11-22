# SEO e GEO do Vencedital: auditoria, pesquisa e plano

Autora: Radar SEO. Medições de 22/11/2026, em https://vencedital.com.br (código do `main` em 689dbe8). Dono da frente: Radar SEO; deploy e merge passam pelo Radar Organizer.

GEO aqui significa fazer ChatGPT, Perplexity, Gemini, Claude e os resumos do Google (AI Overviews) citarem o Vencedital com fatos corretos.

## Resumo em 8 linhas

1. O site é rastreável e a migração do domínio antigo está correta (301 com caminho e query).
2. **O maior problema técnico:** título, description, canonical e Open Graph das páginas de edital, órgão e fornecedor saem no `<body>`, não no `<head>`, para qualquer robô que não esteja na lista interna do Next. GPTBot, ClaudeBot, PerplexityBot e até o Googlebot caem nessa lista de "não limitados". Quem lê só o HTML (a maioria dos robôs de IA) não enxerga a metadata.
3. Páginas de órgão e fornecedor **não estão no sitemap** e só são alcançáveis por duas listas em /mercado. O ativo mais valioso (700 mil contratos) está quase invisível.
4. Não há JSON-LD, llms.txt, FAQ em dados estruturados nem hubs por UF, município ou categoria. Os concorrentes já têm llms.txt e páginas programáticas.
5. /buscar com filtros gera URLs infinitas sem canonical. Página inexistente responde 200 (soft 404).
6. Velocidade: LCP de 4,3 a 5,4 s em mobile nas páginas internas (simulado). O servidor fala só HTTP/1.1.
7. Nada de nota ou avaliação no schema. Toda estatística vem do banco com data.
8. Medição: Search Console e Bing Webmaster precisam de login do usuário (passo a passo na seção 5). Enquanto isso, o log do nginx já mede visitas de robôs de IA.

---

## 1. Auditoria do estado atual (no ar)

### 1.1 Indexabilidade, canonical e redirecionamentos

| Item | Resultado | Situação |
|---|---|---|
| `https://vencedital.com.br/` | 200, canonical `https://vencedital.com.br` | ok |
| `www.vencedital.com.br/x` e `http://vencedital.com.br/x` | 301 para `https://vencedital.com.br/x` | ok |
| `apps.giovaniohira.com/radar/edital/x?a=1` | 301 para `https://vencedital.com.br/edital/x?a=1`; `/radar` vai para `/` | ok, mantém query |
| HSTS | `max-age=300` | previsto subir para 1 ano depois de 1 a 2 semanas (PLANO.md) |
| `/edital/[id]`, `/orgao/[cnpj]`, `/fornecedor/[ni]` | canonical presente (no `<body>`, ver 1.4) | atenção |
| `/buscar`, `/mercado` | **sem canonical**, description e og:title herdados da home | corrigir |
| `/buscar?q=limpeza&uf=SP` | 200, 141 KB, sem canonical e sem noindex: espaço infinito de URLs | corrigir |
| `/entrar` | indexável (sem `robots`), título "Entrar" | noindex (área da Radar Auth) |
| Página inexistente (`/orgao/000…`, `/edital/…2020`) | **HTTP 200** com título "não encontrado" e `noindex` só no corpo | soft 404, ver 1.4 |
| Rota inexistente (`/naoexiste`) | 404 correto | ok |

### 1.2 Sitemap

- `/sitemap.xml`: **25.822 URLs**, 3,4 MB sem compressão (vai comprimido via gzip), levou **4,8 s** para responder (consulta ao banco a cada pedido: `connection()` sem cache).
- Conteúdo: 5 páginas fixas + 25.817 editais abertos. Zero órgãos, zero fornecedores.
- `lastmod` só nos editais, e vale `publicado_em`, não a última atualização. As páginas fixas não têm `lastmod`. `changefreq` e `priority` são ignorados pelo Google e pelo Bing.
- Limite do protocolo: 50.000 URLs ou 50 MB por arquivo. Já está na metade da contagem; com órgãos e fornecedores vai estourar. Precisa de índice com vários arquivos.

### 1.3 robots.txt

```
User-Agent: *  / Allow: /
Disallow: /painel /pipeline /alertas /conta /boas-vindas /entrar/confirmar
Sitemap: https://vencedital.com.br/sitemap.xml
```

- GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Perplexity-User e Google-Extended **herdam o `*` e podem rastrear tudo**. Está certo para GEO, mas não é explícito.
- Falta bloquear o espaço de filtros de `/buscar?…`.
- Os concorrentes declaram os robôs de IA de forma explícita (ConLicitação, Effecti, Atlas Público; ver seção 2).

### 1.4 Metadata, Open Graph e o problema do `<head>`

O `next.config.ts` usa `cacheComponents: true`. Com isso o Next 16 **faz streaming da metadata** para qualquer user agent que não esteja em `HTML_LIMITED_BOT_UA_RE` (documentação: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, seção "Streaming metadata"). A metadata chega depois, dentro do `<body>`, e só quem executa JavaScript a recoloca no `<head>`.

Teste feito com `curl` e 4 user agents, na página `/orgao/92963560000160`:

| User agent | `<title>` dentro do `<head>`? |
|---|---|
| Bingbot, facebookexternalhit | **sim** (estão na lista do Next) |
| Googlebot | **não** (o Google executa JS e indexa mesmo assim, mas é mais lento e frágil) |
| GPTBot | **não** |
| PerplexityBot | **não** |

Prova indireta: o Lighthouse reportou "Document does not have a meta description" nas páginas de órgão e edital (SEO 91, contra 100 na home).

Consequências:
- Robôs de IA que leem só o HTML não veem título, description, canonical nem og:*.
- O soft 404 acima existe pelo mesmo motivo: o status HTTP sai antes de `notFound()` rodar. Quando o robô está na lista "limitada", o Next espera a metadata e devolve 404 de verdade.

Outros achados de metadata:
- Open Graph: uma só imagem genérica (`opengraph-image.tsx`) para o site todo. `og:title` das páginas fixas repete o da home.
- Título de edital usa o objeto cru e corta com "…" (ex.: "Empresa do ramo pertinente para a execução do serviço de pavimentação… · Vencedital"), sem município nem UF.
- Idioma `pt-BR` e `metadataBase` corretos.

### 1.5 Headings, landmarks e links internos

- Home: um `h1`, `h2` em sequência. Órgão e fornecedor: um `h1` cada, `h2` por bloco. ok.
- Páginas internas do app não têm `<main>` (Lighthouse `landmark-one-main`, acessibilidade 98).
- Links internos únicos por página: home 14, /buscar 43, /mercado 42, edital 11. Edital liga ao órgão; órgão liga a fornecedores; fornecedor liga a órgãos. Não há breadcrumb com URL para UF, município ou categoria, porque essas páginas não existem.
- Fornecedores e órgãos só entram no grafo de links por /mercado (listas "quem mais compra/vence") e pelas páginas de edital. Sem sitemap, a maioria é praticamente órfã.

### 1.6 Desempenho (Lighthouse 13.6, mobile simulado, rodado em 22/11 contra produção)

A cota pública do PageSpeed Insights estava esgotada e não existe dado de campo (CrUX) para o site novo. Os números abaixo são de laboratório.

| Página | Perf | SEO | A11y | LCP | TBT | CLS | TTFB (documento) |
|---|---|---|---|---|---|---|---|
| `/` | 89 | 100 | 100 | 1,5 s | 410 ms | 0 | 20 ms |
| `/orgao/92963560000160` | 83 | 91 | 98 | **4,7 s** | 60 ms | 0 | 270 ms |
| `/edital/01612604000151-1-000050%2F2026` | 84 | 91 | 98 | **4,3 s** | 80 ms | 0 | 10 ms |
| `/buscar` | 78 | 100 | 98 | **5,4 s** | 50 ms | 0 | 210 ms |

- Todas as respostas vêm por **HTTP/1.1** (`deploy/nginx-site.conf`: `listen 443 ssl;` sem `http2`). Lighthouse estima 1,09 s de ganho.
- No órgão, o LCP é o `h1`, com 920 ms de atraso de renderização após o TTFB de 313 ms. O conteúdo vem atrás de `Suspense` e de uma consulta dinâmica.
- `/mercado` levou **81 s** na primeira chamada do dia (cache frio) e 0,17 s nas seguintes. Um robô que chegar com o cache frio vai dar timeout. O CI já aquece a visão padrão depois de cada deploy (comentário em `mercado/page.tsx`), então vale a Radar Dev conferir se o aquecimento cobre a URL exata `/mercado` e se refaz depois da ingestão das 6h.
- `Cache-Control: private, no-cache, no-store` em todas as páginas. Como não há CDN, nada a fazer agora, mas todo ganho precisa vir do cache da aplicação.

### 1.7 Páginas finas ou duplicadas

Medido num banco local de desenvolvimento (cópia de outubro/2026, **180 mil contratos e 14,8 mil editais**; produção tem mais, então os números de produção devem ser maiores e precisam ser remedidos antes de ligar os limiares):

| Corte (contratos assinados nos últimos 12 meses) | Órgãos | Fornecedores | Municípios |
|---|---|---|---|
| Qualquer um | 7.480 | 48.761 | 3.479 |
| ≥ 5 contratos | 3.760 | 5.545 | n/d |
| ≥ 10 contratos | 2.441 | 2.372 | n/d |
| ≥ 20 contratos | n/d | n/d | 1.213 |
| ≥ 50 contratos | n/d | n/d | 676 |

Leitura: **mais de 80% dos fornecedores e metade dos órgãos têm dado fino** (poucos contratos). Indexar tudo seria criar milhares de páginas finas, exatamente o padrão que a política de spam do Google chama de "scaled content abuse". Por isso o plano usa limiares e deixa o resto em `noindex, follow` e fora do sitemap.

Duplicidade: com `?q=` e `?uf=` a mesma lista de editais aparece sob URLs infinitas. Cobrir com canonical e `Disallow`.

Categorias reais no banco: Compras (127 mil), Serviços (41 mil), Obras, Serviços de Engenharia, Serviços de Saúde, Cessão, Informática (TIC), Locação de Imóveis, Mão de Obra, Alienação, Internacional. 27 UFs presentes.

---

## 2. Pesquisa

### 2.1 Limites desta pesquisa (leia antes)

- **Não tenho volume de busca.** Ferramentas como Semrush, Ahrefs e o Planejador de Palavras-chave exigem conta paga ou login do Google Ads, e Search Console só existirá depois da verificação. Nenhum volume abaixo é inventado: cada intenção vem com a página que apareceu na busca e nada mais.
- **Não consegui perguntar ao ChatGPT nem ao Perplexity.** O Perplexity pediu login ("Sign in to continue", 22/11); criar conta está fora da minha autorização. Para ver o que as IAs citam usei a ferramenta de busca web do próprio agente, que responde com fontes. Isso mostra o que um motor de busca com IA recupera, mas **não é prova do que o ChatGPT ou o Perplexity mostram hoje**. Protocolo de verificação manual na seção 5.
- Não testei Gemini, Claude.ai nem AI Overviews.

### 2.2 Intenções de busca e quem aparece

Consultas feitas em 22/11/2026; cada linha é o que a busca devolveu, sem ordem de volume.

| Intenção (exemplo) | Quem apareceu | Observação |
|---|---|---|
| "licitações abertas hoje por cidade" | [ConLicitação (guias "editais de licitação abertos")](https://conlicitacao.com.br/editais-de-licitacao-abertos/), [Alerta Licitação, páginas por estado e CNAE](https://alertalicitacao.com.br/!estado/SP), [Atlas Público](https://atlaspublico.com.br/noticias/licitacoes), portais de prefeituras | Alerta Licitação mostrava listagem "vencendo hoje" com data de agosto: **conteúdo velho aparece e é citado**, então frescor com data é um diferencial. |
| "como participar de pregão eletrônico" | [ConLicitação](https://conlicitacao.com.br/como-ganhar-pregao-eletronico/), [Effecti](https://effecti.com.br/pregao-eletronico/), [manuais do gov.br/compras](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manuais-antigos/manual-pregao/manual_pregao-eletronico-fornecedor.pdf) | O manual oficial que aparece é anterior à Lei 14.133/2021. Espaço para um guia atualizado e curto, com link para a fonte oficial. |
| "quem ganhou licitação / consultar contratos por órgão ou fornecedor" | [Atlas Público: como saber quem ganhou](https://atlaspublico.com.br/guias/como-saber-quem-ganhou-licitacao), [PNCP perguntas e respostas](https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas), gov.br | O guia do Atlas lembra que "quem ganhou" pode variar por item ou lote. **É o terreno do Vencedital**: temos contratos por órgão e por fornecedor. |
| "melhor sistema de alerta de licitações" | páginas próprias de [Effecti](https://effecti.com.br/planos/) e [ConLicitação](https://conlicitacao.com.br/ferramentas/gerenciamento-de-licitacoes/), comparadores genéricos como [B2B Stack](https://www.b2bstack.com.br/compare/alerta-licitacoes-vs-conlicitacao) | Nenhum comparativo independente encontrado, e nenhum resultado sobre o LicitaJá. Vencedital não aparece. |

Outras intenções que o produto atende e que dá para escrever com dado real (não verifiquei volume): "licitação de [categoria] em [UF]", "contratos da prefeitura de [cidade]", "quanto o [órgão] gasta com [categoria]", "empresas que vendem para [órgão]", "o que é ata de registro de preços", "cota ME/EPP em licitação", "como se cadastrar no SICAF".

### 2.3 Concorrentes (22/11/2026, coletado com `curl` nos sites públicos)

| | ConLicitação | Effecti | Alerta Licitação | Atlas Público | LicitaJá |
|---|---|---|---|---|---|
| `llms.txt` | sim (gerado pelo Yoast) | sim, bem escrito | sim, com cobertura e metodologia | sim | **não** (devolve HTML com 200) |
| Robôs de IA no robots.txt | explícito: OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot, GPTBot, ClaudeBot, Google-Extended, CCBot, com `Content-Signal` | explícito (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) | arquivo sem regras de IA | explícito, com bloqueios de áreas de dados | só `*` |
| JSON-LD na home | Organization, BreadcrumbList, SearchAction | Organization, WebSite | não encontrei | Organization, WebSite | **FAQPage com 16 perguntas** |
| Páginas programáticas | blog extenso e guias | sitemap dedicado: **28 hubs de UF, 500 municípios, 379 órgãos** (`/licitacoes/sp/…`, `/licitacoes/orgao/…`) | páginas por estado e por CNAE | guias, notícias, páginas de entidades | n/d |
| Sitemap | índice com posts, páginas, ferramentas | principal + `sitemap-pseo.xml` | `/sitemap.xml` devolve 404 (talvez esteja noutro endereço) | principal + news | `sitemap-licitaja.xml` |

Conclusões honestas:
- O Effecti já escalou páginas por município e órgão, mas só com 500 e 379 URLs, o que mostra um corte por qualidade. **Não vou copiar o volume; vou copiar o princípio** (limiar por dado).
- Todos os que têm tráfego relevante declaram `llms.txt` ou robots de IA. Não há prova pública de que isso aumente citações. É barato e deixa o Vencedital no mesmo nível.
- Nenhum concorrente mostra "quem ganhou" por órgão e fornecedor com número e data em página aberta. É a diferenciação real, e é um recurso que já existe no produto.

### 2.4 Fontes consultadas

- [Next.js: Streaming metadata e `htmlLimitedBots`](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots) (cópia local em `node_modules/next/dist/docs/`).
- [Next.js: guia de JSON-LD](https://nextjs.org/docs/app/guides/json-ld).
- [llmstxt.org](https://llmstxt.org/).
- [Google: políticas de spam (scaled content abuse)](https://developers.google.com/search/docs/essentials/spam-policies) e [dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/search-gallery). Consultar antes de cada PR de schema.
- [Protocolo de sitemap](https://www.sitemaps.org/protocol.html) (50 mil URLs ou 50 MB por arquivo).
- Páginas dos concorrentes citadas na tabela e [PNCP](https://www.gov.br/pncp/pt-br).

---

## 3. Plano em ordem de impacto por esforço

Legenda: **I** impacto (alto/médio/baixo), **E** esforço (horas/dias), **Quem** (SEO = eu; Dev, Organizer, Auth, Copy e Design onde há arquivo ou decisão deles).

### Fase 1: técnico e schema (horas a 1 dia, um PR por item)

| # | Entrega | I | E | Quem | Detalhe |
|---|---|---|---|---|---|
| 1 | **Metadata no `<head>` para robôs de IA e Google** (`htmlLimitedBots`) | alto | horas | SEO | Acrescentar à lista padrão do Next: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, anthropic-ai, PerplexityBot, Perplexity-User, Applebot-Extended, CCBot, Googlebot, Amazonbot, Bytespider, meta-externalagent. Efeito colateral bom: com `notFound()` dentro do `generateMetadata`, esses robôs recebem **404 de verdade** (feito para órgão e fornecedor; a página de edital é da Radar Dev e fica para ela). Navegadores comuns continuam com 200 + `noindex`, porque o status sai antes do corpo. Custo ao banco: nenhum (a consulta já é compartilhada com `React.cache`). Medir TTFB antes e depois. |
| 2 | **robots.txt explícito** | médio | horas | SEO | Regras por robô de IA (tudo permitido, igual a hoje, só que declarado), `Disallow: /buscar?` e `/entrar`. Decisão do usuário: treino de IA (GPTBot, ClaudeBot, Google-Extended, CCBot) fica **permitido** porque o conteúdo é dado público e o objetivo é ser citado; se o usuário preferir bloquear só o treino, é uma linha. |
| 3 | **Canonical e metadata únicas** em `/buscar`, `/mercado`, `/entrar` e título de edital melhor | médio | horas | SEO (+ Auth para `/entrar`, 1 linha de `robots: noindex`) | `/buscar` canonical para si mesmo; resultados filtrados `noindex, follow`. Título de edital: objeto resumido + órgão + UF. Combinar com Radar Dev porque o arquivo é da página de edital. |
| 4 | **JSON-LD** | alto | 1 dia | SEO | `Organization` (nome Vencedital, `legalName` OHIRA TECNOLOGIA LTDA., CNPJ, url, logo; `sameAs` só com perfis que existirem), `WebSite`, `SoftwareApplication` com `Offer` real (R$ 97, BRL, mensal; 14 dias grátis descritos em texto, nunca como preço zero) na landing, `FAQPage` espelhando o FAQ visível, `BreadcrumbList` em edital, órgão e fornecedor. **Sem `AggregateRating` nem `Review`.** Rejeitado: `GovernmentService` (descreve serviço de governo; o Vencedital é privado e sem vínculo com o governo, usar esse tipo seria enganoso). `Dataset` só nas páginas agregadas da fase 2, com fonte PNCP e data. |
| 5 | **Sitemap em índice**, com cache e `lastmod` real | alto | 1 dia | SEO | `generateSitemaps` para: fixas, editais abertos, órgãos elegíveis, fornecedores elegíveis, hubs. `lastmod` = `atualizado_em`. Sem `changefreq` e `priority`. Cache de 1 hora para derrubar os 4,8 s e a carga no banco. |
| 6 | **`llms.txt`** | médio (barato) | horas | SEO + Copy | Rota `/llms.txt` com o que é o produto, preço, cobertura (só PNCP, sem dizer mais do que existe), limites ("o resumo da IA pode errar"), links para páginas-chave e `Atualizado em` gerado. Sem `llms-full.txt` por enquanto. Sem evidência pública de que mexa em ranking ou citação; custa pouco. |
| 7 | **HTTP/2 no nginx** | médio (CWV) | minutos | Organizer/Dev | `listen 443 ssl http2;` (nginx 1.24). Reload do nginx já autorizado nesta rodada. |
| 8 | `<main>` nas páginas do app | baixo | minutos | Dev (layout compartilhado) | Acessibilidade 98 para 100 e melhor leitura por robôs. |

### Fase 2: páginas programáticas com dados únicos (dias)

Regra única: **a página só é indexável e só entra no sitemap se passar no limiar de dado; senão `noindex, follow` e fora do sitemap.** Cada página mostra apenas números do banco com a data de corte, listas reais e frases montadas a partir desses números. Nada de parágrafo "SEO" genérico.

| # | Página | Limiar inicial (a remedir em produção) | Dados únicos |
|---|---|---|---|
| 9 | `/licitacoes/[uf]` (27) | sempre | editais abertos, contratos 12 meses, valor mediano, principais categorias, maiores compradores, municípios com mais editais |
| 10 | `/licitacoes/[uf]/[municipio]` | ≥ 20 contratos em 12 meses ou ≥ 3 editais abertos (≈ 1.200 municípios no banco local) | idem + órgãos do município, editais abertos, categorias |
| 11 | Órgão (já existe, `/orgao/[cnpj]`) | ≥ 10 contratos em 12 meses ou ≥ 1 edital aberto (≈ 2.400 no banco local) | já tem KPIs, abertos, categorias e fornecedores; acrescentar data de corte, breadcrumb e link para o município |
| 12 | Fornecedor (já existe) | ≥ 10 contratos e ≥ 3 órgãos (≈ 1.600 no banco local); só CNPJ, nunca CPF | principais clientes, categorias, valores |
| 13 | `/licitacoes/[uf]/[categoria]` | ≥ 20 contratos em 12 meses | quem compra, quem vence, mediana; categoria na taxonomia real do banco |

Notas de engenharia:
- Slugs de município por `codigo_ibge` + nome, para não colidir homônimos entre UFs.
- Carga no banco: criar uma tabela ou view materializada de agregados (`seo_agregados`), atualizada uma vez por dia depois da ingestão, e as páginas leem dela. Exige migração (backup antes, regra do PLANO.md): **combinar com a Radar Dev**. Alternativa sem migração: `use cache` com `cacheLife("days")`, aceitável só se uma consulta fria ficar abaixo de 1 s (medir; hoje `/mercado` frio leva 81 s).
- Nada de `generateStaticParams` com milhares de páginas num banco de 384 MB (limite do container): páginas dinâmicas com cache, mais o sitemap.
- Cada hub liga para os filhos e para o pai; breadcrumb com URL.
- Página de município sem edital aberto e sem contrato recente: `noindex`.

### Fase 3: conteúdo citável (1 a 2 semanas, ritmo contínuo)

Formato que IAs conseguem citar: resposta curta na primeira frase, número com data e fonte, definição de uma linha, FAQ real, nada de enrolação.

| # | Entrega | Detalhe |
|---|---|---|
| 14 | **Painel público "Compras públicas no PNCP"** (`/mercado`, já existe) | Frase de abertura citável ("Em [mês/ano], o PNCP registrou N contratos que somam R$ X, segundo o banco do Vencedital atualizado em [data]"), metodologia e limites de cobertura. Schema `Dataset`. |
| 15 | **Glossário e guias curtos** | `/guias/como-participar-de-pregao-eletronico`, `/guias/como-saber-quem-ganhou-uma-licitacao`, `/guias/ata-de-registro-de-precos`, `/guias/cota-me-epp`, `/guias/como-cadastrar-no-sicaf`. Escritos com Radar Copy, **revisados contra a Lei 14.133/2021 e as páginas do gov.br**, com link para a fonte oficial e data de revisão. Radar Legal & Finance valida qualquer afirmação jurídica. |
| 16 | **Relatório mensal com números do banco** | Um texto por mês, só com o que o banco prova (ex.: categorias que mais cresceram), com a consulta usada descrita. Só publica se tiver o que dizer. |
| 17 | **FAQ por hub** | 3 a 4 perguntas cuja resposta é um número do banco ("Quantos editais estão abertos em Rondônia?"). Só em hubs que passaram no limiar. |

O que não vou fazer: texto gerado em massa, página por palavra-chave, resposta que repete o que o gov.br já diz sem acrescentar dado, links comprados.

### Fase 4: entidade, medição e desempenho (contínuo)

| # | Entrega | Detalhe |
|---|---|---|
| 18 | **Marca consistente** | "Vencedital" (um nome, sem "Radar de Licitações"), mesma grafia no `<title>`, Organization, rodapé, llms.txt, e-mails. `legalName` OHIRA TECNOLOGIA LTDA. no schema. `sameAs` só com perfil real; hoje não há nenhum. |
| 19 | **Off-site (decisão do usuário)** | Perfil no LinkedIn, Google Perfil da Empresa e Wikidata exigem conta ou critério de notoriedade, e estão fora do meu escopo. Sem backlinks comprados e sem outreach. Lista para o usuário decidir na seção 5. |
| 20 | **Medição sem conta: log do nginx** | Há log de acesso de 6 meses em `/var/log/nginx-vencedital`. Script semanal (`scripts/seo-report.ts`) que conta por user agent: visitas de GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Googlebot, Bingbot; status 200/404/5xx por seção; páginas mais pedidas; referências vindas de `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `claude.ai`, Google e Bing. Exige acesso ao servidor: **pedir à Radar Dev**. |
| 21 | **Medição com conta (usuário)** | Google Search Console e Bing Webmaster Tools: passo a passo na seção 5. |
| 22 | **Teste mensal de citação** | 30 perguntas fixas feitas a ChatGPT, Perplexity, Gemini, Claude e Google, anotando se o Vencedital aparece, se o fato citado está certo e qual URL. Planilha em `docs/empresa/seo-geo-medicao.md`. Manual, porque exige login. |
| 23 | **Velocidade** | Meta: LCP ≤ 2,5 s nas páginas de órgão, edital e buscar (hoje 4,3 a 5,4 s simulados). Alavancas: HTTP/2, tirar o `h1` de trás de `Suspense`, cache dos agregados, aquecimento de cache pós-deploy. Cada mudança medida com Lighthouse antes e depois. |
| 24 | **IndexNow** | Protocolo aberto (Bing e outros) que avisa de URLs novas; exige só um arquivo de chave no domínio, sem conta. É chamada a terceiro, então só com OK do Organizer. |

---

## 4. Entregas em PRs (do maior impacto ao menor)

| PR | Conteúdo | Itens | Depende de |
|---|---|---|---|
| 1 | Metadata no `<head>` para robôs de IA + robots explícito + canonical/metadata únicas + `/entrar` noindex | 1, 2, 3 | combinar o arquivo da página de edital com a Radar Dev e `/entrar` com a Radar Auth |
| 2 | JSON-LD (Organization, WebSite, SoftwareApplication, FAQPage, BreadcrumbList) | 4 | texto do FAQ e da landing vêm da Radar Copy; não mexo no layout |
| 3 | Sitemap em índice + cache + `lastmod` real + `llms.txt` | 5, 6 | Organizer (deploy) |
| 4 | nginx com HTTP/2 | 7 | Organizer/Dev (reload) |
| 5 | Hubs por UF e município + limiares de indexação nas páginas de órgão e fornecedor | 9 a 12 | Radar Dev (migração dos agregados) |
| 6 | Categorias, painel citável e FAQ por hub | 13, 14, 17 | PR 5 |
| 7 | Guias e glossário | 15 | Radar Copy e Radar Legal & Finance |
| 8 | `seo-report.ts` do log | 20 | Radar Dev (acesso ao servidor) |

Cada PR só vai ao Organizer com typecheck, lint, testes e build verdes e com medição antes e depois (TTFB, tamanho do HTML, tempo do sitemap, Lighthouse da página afetada).

## 5. Passo a passo para o usuário (contas e DNS: fora do que faço sozinha)

### 5.1 Google Search Console
1. Entrar em https://search.google.com/search-console com a conta Google do usuário.
2. Adicionar propriedade do tipo **Domínio** e digitar `vencedital.com.br`.
3. O Google mostra um registro **TXT** (`google-site-verification=…`). **Me mande esse valor** e eu peço ao Organizer para criar o TXT no Registro.br/DNS. Alternativa sem DNS: propriedade de **prefixo de URL** com arquivo HTML de verificação ou meta tag; me avise e eu preparo.
4. Depois de verificado: Sitemaps, enviar `https://vencedital.com.br/sitemap.xml`.
5. Em Inspeção de URL, testar `/`, um edital e um órgão: confirmar "O URL pode ser indexado" e olhar o HTML renderizado.

### 5.2 Bing Webmaster Tools (também alimenta resultados de IA que usam o índice do Bing; ver nota abaixo)
1. Entrar em https://www.bing.com/webmasters.
2. Usar "Importar do Google Search Console" (evita um segundo TXT).
3. Enviar o mesmo sitemap.

Nota: é comum dizer que o ChatGPT com busca usa o índice do Bing; **não confirmei isso em fonte da OpenAI**, então trate como hipótese razoável e não como fato.

### 5.3 O que fica na mão do usuário (decisões, nada feito por mim)
- Perfil de empresa no LinkedIn e outros perfis para `sameAs`.
- Permitir ou bloquear robôs de treino de IA (hoje tudo permitido).
- Autorizar IndexNow.

## 6. Linha de base para comparar depois

| Métrica | Hoje (22/11/2026) |
|---|---|
| URLs no sitemap | 25.822 (5 fixas + 25.817 editais abertos), 0 órgãos, 0 fornecedores |
| Tempo do sitemap | 4,8 s |
| Metadata no `<head>` para GPTBot/PerplexityBot/Googlebot | não |
| JSON-LD, `llms.txt` | não, não |
| Lighthouse mobile (perf/SEO): home, órgão, edital, buscar | 89/100, 83/91, 84/91, 78/100 |
| LCP órgão, edital, buscar | 4,7 s, 4,3 s, 5,4 s |
| Protocolo | HTTP/1.1 |
| `/mercado` com cache frio | 81 s |
| Páginas com título "não encontrado" respondendo 200 | sim |
| Search Console e Bing | não configurados |
| Citações em IA | não medidas (precisa de login) |

## 7. Regras que valem em todo PR

- Sem cloaking: robô e visitante recebem o mesmo conteúdo. (Mudar a ordem de entrega da metadata para robôs específicos é só a forma de entrega; o conteúdo não muda.)
- Sem doorway, sem texto em massa, sem keyword stuffing.
- Toda estatística vem de uma consulta ao banco e mostra a data de corte. Nenhum número escrito à mão.
- Nenhuma nota ou avaliação no schema.
- Texto da landing passa pela Radar Copy; layout, pela Radar Design.
- Antes de editar arquivo que outra agente mexe (páginas de edital, `entrar/`, `boas-vindas/`, `session`, `auth`), aviso a dona.
