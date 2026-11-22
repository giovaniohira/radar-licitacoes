import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCnpj,
  hashSenha,
  hashToken,
  icsToken,
  newLoginToken,
  normalizeCnpj,
  normalizeEmail,
  parseIdentificador,
  problemaSenha,
  signSession,
  verificarSenha,
  verifyIcsToken,
  verifySession,
} from "@/lib/auth";
import { AVISO_DIGEST, renderDigest, type Alert } from "@/lib/alerts";
import { mascaraCnpj } from "@/lib/cnpj";
import { consultarCnpj, formatCnae, palavrasDoHistorico, setoresDoCnae, setoresSugeridos } from "@/lib/cnpj-publico";
import { quemSomos } from "@/lib/empresa";
import { destacar, formatBRL, formatDia, frase, local, nome, prazo, prazoTom, tituloCurto } from "@/lib/format";
import { dias, hojeBR } from "@/lib/ingest";
import { parseFiltros, parseValor, withParams } from "@/lib/params";
import { whereContratos } from "@/lib/mercado";
import { fold, renderIcs, vencendo, type PipelineItem } from "@/lib/pipeline";
import { minimoDePalavras, prefiltroGin, termosDoObjeto } from "@/lib/quemganhou";
import { aplicativo, faq, landing, organizacao, serializar, trilha } from "@/lib/schema";
import { FILTRADAS, PRIVADAS, ROBOS_IA_BUSCA, ROBOS_IA_TREINO, robotsFor } from "@/lib/robots";
import nextConfig from "../next.config";
import { buildSearch, toWebsearch, type EditalResumo } from "@/lib/search";

const KEY = "k".repeat(40);

describe("session", () => {
  it("round-trips and rejects tampering", () => {
    const now = Date.UTC(2026, 9, 16);
    const s = signSession(42, now, KEY);
    expect(verifySession(s, now, KEY)?.id).toBe(42);
    expect(verifySession(s, now, KEY)?.emitida).toBe(Math.floor(now / 1000));
    expect(verifySession(s.replace(/^42/, "43"), now, KEY)).toBeNull();
    expect(verifySession(s, now, "x".repeat(40))).toBeNull();
    expect(verifySession("lixo", now, KEY)).toBeNull();
    expect(verifySession(undefined, now, KEY)).toBeNull();
  });
  it("expires after 30 days", () => {
    const now = Date.UTC(2026, 9, 16);
    const s = signSession(1, now, KEY);
    expect(verifySession(s, now + 29 * 86400_000, KEY)?.id).toBe(1);
    expect(verifySession(s, now + 31 * 86400_000, KEY)).toBeNull();
  });
  it("login tokens are random and stored hashed", () => {
    const a = newLoginToken();
    const b = newLoginToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
  it("normalizes e-mails", () => {
    expect(normalizeEmail("  Fulano@Empresa.COM.br ")).toBe("fulano@empresa.com.br");
    expect(normalizeEmail("sem-arroba")).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes with a fresh salt and verifies", async () => {
    const a = await hashSenha("cafe com leite 2026");
    const b = await hashSenha("cafe com leite 2026");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("cafe");
    expect(await verificarSenha("cafe com leite 2026", a)).toBe(true);
    expect(await verificarSenha("cafe com leite 2025", a)).toBe(false);
    expect(await verificarSenha("", a)).toBe(false);
  });
  it("always fails without a stored hash, or with a malformed one", async () => {
    expect(await verificarSenha("qualquer", null)).toBe(false);
    expect(await verificarSenha("qualquer", undefined)).toBe(false);
    expect(await verificarSenha("qualquer", "lixo")).toBe(false);
  });
  it("treats composed and decomposed accents as the same password", async () => {
    const h = await hashSenha("açaí gelado");
    expect(await verificarSenha("açaí gelado".normalize("NFD"), h)).toBe(true);
  });
  it("only checks length", () => {
    expect(problemaSenha("curta")).toMatch(/8 caracteres/);
    expect(problemaSenha("12345678")).toBeNull();
    expect(problemaSenha("x".repeat(201))).toMatch(/200/);
  });
});

describe("CNPJ", () => {
  it("validates check digits with or without punctuation", () => {
    expect(normalizeCnpj("68.631.511/0001-45")).toBe("68631511000145");
    expect(normalizeCnpj(" 68631511000145 ")).toBe("68631511000145");
    expect(normalizeCnpj("68.631.511/0001-46")).toBeNull();
    expect(normalizeCnpj("11.111.111/1111-11")).toBeNull();
    expect(normalizeCnpj("6863151100014")).toBeNull();
  });
  it("accepts the alphanumeric format (Receita example 12.ABC.345/01DE-35)", () => {
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizeCnpj("12.ABC.345/01DE-36")).toBeNull();
    expect(normalizeCnpj("12.ABC.345/01DE-3A")).toBeNull();
    expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
  it("reads the single sign-in field as e-mail or CNPJ", () => {
    expect(parseIdentificador(" Fulano@Empresa.com ")).toEqual({ tipo: "email", valor: "fulano@empresa.com" });
    expect(parseIdentificador("68.631.511/0001-45")).toEqual({ tipo: "cnpj", valor: "68631511000145" });
    expect(parseIdentificador("68.631.511/0001-40")).toBeNull();
    expect(parseIdentificador("fulano@")).toBeNull();
  });
});

describe("toWebsearch", () => {
  it("turns commas into OR and keeps exclusions", () => {
    expect(toWebsearch("notebook, computador portátil;\nimpressora -locação")).toBe(
      "notebook or computador portátil or impressora -locação",
    );
    expect(toWebsearch(" , ,")).toBe("");
  });
});

describe("buildSearch", () => {
  it("parameterizes every user value", () => {
    const { sql, params } = buildSearch({
      palavras: "pneu'; drop table editais; --",
      ufs: ["pr", "XX1", "sc"],
      modalidades: [6, 8],
      valorMin: 1000,
      valorMax: 50000,
    });
    expect(sql).not.toContain("drop table");
    expect(params).toEqual(["pneu' or drop table editais or --", ["PR", "SC"], [6, 8], 1000, 50000, 50, 0]);
    expect(sql).toContain("websearch_to_tsquery('portuguese', f_unaccent($1))");
    expect(sql).toContain("order by rank desc");
  });
  it("only open editais by default; can exclude already-sent ones", () => {
    expect(buildSearch({}).sql).toContain("encerramento > now()");
    expect(buildSearch({ abertas: false }).sql).not.toContain("encerramento > now()");
    const { sql, params } = buildSearch({ excluirEnviadosAlerta: 7 });
    expect(sql).toContain("alert_envios");
    expect(params[0]).toBe(7);
  });
});

describe("params", () => {
  it("parses Brazilian money formats", () => {
    expect(parseValor("1.500,50")).toBe(1500.5);
    expect(parseValor("R$ 80000")).toBe(80000);
    expect(parseValor("")).toBeNull();
    expect(parseValor("-5")).toBeNull();
  });
  it("parses search params defensively", () => {
    const f = parseFiltros({ q: "pneu", uf: ["PR", "SC,RS"], modalidade: "6", p: "999", encerradas: "1" });
    expect(f).toMatchObject({ palavras: "pneu", ufs: ["PR", "SC", "RS"], modalidades: [6], pagina: 200, abertas: false });
  });
});

describe("format", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("describes deadlines", () => {
    expect(prazo("2026-10-16T10:00:00Z", now)).toBe("encerrado");
    expect(prazo("2026-10-16T17:00:00Z", now)).toBe("hoje, em 5h");
    expect(prazo("2026-10-17T13:00:00Z", now)).toBe("amanhã");
    expect(prazo("2026-10-26T13:00:00Z", now)).toBe("em 10 dias");
    expect(prazo(null, now)).toBe("sem prazo");
  });
  it("drops the city when the buyer already names it", () => {
    expect(local("CAIRU", "BA")).toBe("Cairu · BA");
    expect(local("CAIRU", "BA", "MUNICIPIO DE CAIRU")).toBe("BA");
    expect(local("SÃO PAULO", "SP", "Secretaria Municipal de Saúde")).toBe("São Paulo · SP");
  });
  it("treats 0 as secret budget", () => {
    expect(formatBRL(0)).toBe("Sigiloso");
    expect(formatBRL(1234)).toMatch(/1\.234/);
  });
});

describe("dates", () => {
  it("lists inclusive day ranges", () => {
    expect(dias("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("uses Brasília's date, not UTC", () => {
    // 01:00 UTC on the 16th is still the 15th in Brasília.
    expect(hojeBR(0, new Date("2026-10-16T01:00:00Z"))).toBe("2026-10-15");
    expect(hojeBR(-1, new Date("2026-10-16T12:00:00Z"))).toBe("2026-10-15");
  });
});

describe("renderDigest", () => {
  const alert: Alert = { id: 1, user_id: 1, nome: "TI <script>", palavras: "x", ufs: [], modalidades: [], valor_min: null, valor_max: null };
  const e = {
    id: "1-1-000001/2026",
    objeto: 'Notebooks & "monitores"',
    orgao: "Prefeitura",
    municipio: "Curitiba",
    uf: "PR",
    modalidade: "Pregão eletrônico",
    valor_estimado: 10000,
    encerramento: new Date("2026-10-20T13:00:00Z"),
  } as EditalResumo;

  it("escapes HTML and links each edital", () => {
    const d = renderDigest("https://radar.test", [{ alert, editais: [e] }], new Date("2026-10-16T12:00:00Z"));
    expect(d.subject).toBe("1 novo edital para você");
    expect(d.html).toContain("TI &lt;script&gt;");
    expect(d.html).toContain("Notebooks &amp; &quot;monitores&quot;");
    expect(d.html).toContain("https://radar.test/edital/1-1-000001%2F2026");
    expect(d.text).toContain("em 4 dias");
  });

  it("carries the legal notice in both versions", () => {
    const d = renderDigest("https://radar.test", [{ alert, editais: [e] }], new Date("2026-10-16T12:00:00Z"));
    expect(AVISO_DIGEST).toContain("sem vínculo com o governo");
    expect(AVISO_DIGEST).not.toMatch(/null|undefined/);
    expect(d.text).toContain(AVISO_DIGEST);
    expect(d.html).toContain(AVISO_DIGEST);
    expect(d.html).toContain(">Vencedital</span>");
  });
});

describe("PNCP text casing", () => {
  it("turns ALL-CAPS objects into sentence case, keeping acronyms and UFs", () => {
    expect(frase("AQUISIÇÃO DE EPI PARA A UBS DE BELÁGUA/MA. EXCLUSIVO ME/EPP")).toBe("Aquisição de EPI para a UBS de belágua/MA. Exclusivo ME/EPP");
    expect(frase("Já em caixa mista")).toBe("Já em caixa mista");
    expect(frase("SE NECESSÁRIO")).toBe("Se necessário");
  });
  it("title-cases names with lowercase connectors", () => {
    expect(nome("MUNICIPIO DE SAO MIGUEL DO OESTE")).toBe("Municipio de Sao Miguel do Oeste");
    expect(nome("TECH SOLUCOES LTDA")).toBe("Tech Solucoes LTDA");
  });
});

describe("deadline tone and dates", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("grades urgency", () => {
    expect(prazoTom("2026-10-17T12:00:00Z", now)).toBe("warn");
    expect(prazoTom("2026-10-19T18:00:00Z", now)).toBe("warn"); // "em 3 dias"
    expect(prazoTom("2026-10-21T12:00:00Z", now)).toBe("neutral");
    expect(prazoTom("2026-10-01T12:00:00Z", now)).toBe("neutral");
  });
  it("never shifts a SQL date across timezones", () => {
    expect(formatDia("2026-10-14")).toBe("14/10/2026");
  });
});

describe("search options", () => {
  it("filters by deadline window and orders as asked", () => {
    const { sql, params } = buildSearch({ prazoDias: 7, ordem: "valor" });
    expect(sql).toContain("encerramento < now() + make_interval(days => $1)");
    expect(params[0]).toBe(7);
    expect(sql).toMatch(/order by valor_estimado desc/);
  });
  it("ignores unknown order and out-of-range deadlines", () => {
    expect(parseFiltros({ ordem: "drop", prazo: "999" })).toMatchObject({ ordem: undefined, prazoDias: null });
  });
  it("rewrites query strings", () => {
    expect(withParams({ q: "pneu", uf: ["PR", "SC"], p: "3" }, { p: "4" })).toBe("?q=pneu&uf=PR&uf=SC&p=4");
    expect(withParams({ q: "pneu" }, { q: undefined })).toBe("");
  });
});

describe("market filters", () => {
  it("parameterizes user input and drops invalid UFs", () => {
    const { where, params } = whereContratos({ q: "pneu'; --", uf: "XX'", dias: 30 });
    expect(where).not.toContain("pneu");
    expect(where).not.toContain("XX");
    expect(params).toEqual(["pneu' or --", 30]);
  });
});

describe("pipeline helpers", () => {
  const item = (id: string, etapa: PipelineItem["etapa"], encerramento: string | null) =>
    ({ edital_id: id, etapa, encerramento: encerramento && new Date(encerramento), objeto: `Objeto ${id}`, orgao: "Prefeitura" }) as PipelineItem;

  it("lists active cards closing this week, soonest first", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    const itens = [
      item("a", "analise", "2026-10-20T12:00:00Z"),
      item("b", "triagem", "2026-10-17T12:00:00Z"),
      item("c", "enviada", "2026-10-18T12:00:00Z"),
      item("d", "preparando", "2026-11-30T12:00:00Z"),
      item("e", "analise", "2026-10-10T12:00:00Z"),
    ];
    expect(vencendo(itens, 7, now).map((i) => i.edital_id)).toEqual(["b", "a"]);
  });

  it("folds iCalendar lines at 75 octets, counting multi-byte characters", () => {
    const folded = fold(`SUMMARY:${"ação ".repeat(40)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"ação ".repeat(40)}`);
  });

  it("renders one escaped event per deadline", () => {
    const ics = renderIcs("https://radar.test", [item("1-1-000001/2026", "analise", "2026-10-20T13:00:00Z"), item("x", "triagem", null)], new Date("2026-10-16T00:00:00Z"));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTEND:20261020T130000Z");
    expect(ics).toContain("https://radar.test/edital/1-1-000001%2F2026");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("calendar tokens are per user and unforgeable", () => {
    expect(verifyIcsToken(7, icsToken(7, KEY), KEY)).toBe(true);
    expect(verifyIcsToken(8, icsToken(7, KEY), KEY)).toBe(false);
    expect(verifyIcsToken(7, "short", KEY)).toBe(false);
  });
});

describe("tituloCurto", () => {
  it("drops PNCP boilerplate openings and tails", () => {
    expect(
      tituloCurto(
        "A presente licitação tem como objeto a seleção da proposta mais vantajosa para a contratação de empresa especializada para a prestação de serviços de manutenção preventiva e corretiva",
      ),
    ).toBe("Serviços de manutenção preventiva e corretiva");
    expect(
      tituloCurto(
        "O presente instrumento tem como objetivo a contratação de Empresa Especializada para Aquisição de Computadores All In One e Notebook, que serão destinados a Secretaria Municipal de Cultura",
      ),
    ).toBe("Computadores All In One e Notebook");
    expect(tituloCurto("[Portal de Compras Públicas] - Aquisição de computadores e de infraestrutura completa")).toBe(
      "Computadores e de infraestrutura completa",
    );
    expect(
      tituloCurto(
        "Implantação de Registro de preços para futura e eventual aquisição de equipamentos de informática, computadores, notebooks, destinados ao atendimento das secretarias",
      ),
    ).toBe("Equipamentos de informática, computadores, notebooks");
    expect(tituloCurto("Despesa referente a contratação de serviço especializado para reparo de fonte de alimentação de notebook")).toBe(
      "Reparo de fonte de alimentação de notebook",
    );
    expect(tituloCurto("O objeto da presente licitação é a contratação de solução de tecnologia")).toBe("Solução de tecnologia");
    expect(tituloCurto("Aquisição de Memória Kingston DDR4 8GB 3200MHz, através de dispensa de licitação")).toBe("Memória Kingston DDR4 8GB 3200MHz");
  });
  it("leaves plain objects alone and caps the length", () => {
    expect(tituloCurto("Locação de 10 (dez) equipamentos do tipo tablet")).toBe("Locação de 10 (dez) equipamentos do tipo tablet");
    expect(tituloCurto("Aquisição de pneus")).toBe("Pneus");
    expect(tituloCurto("Aquisição de")).toBe("Aquisição de");
    expect(tituloCurto("palavra ".repeat(30)).length).toBeLessThanOrEqual(81);
  });
});

describe("destacar", () => {
  it("finds the first alert term ignoring accents and case", () => {
    expect(destacar("Aquisição de Computadores e notebooks", "notebook, computador")).toEqual(["Aquisição de ", "Computador", "es e notebooks"]);
    expect(destacar("Serviço de manutenção", "manutencao -predial")).toEqual(["Serviço de ", "manutenção", ""]);
    expect(destacar("Pneus", "notebook")).toBeNull();
  });
});

describe("robots", () => {
  const grupos = (r: ReturnType<typeof robotsFor>) => (Array.isArray(r.rules) ? r.rules : [r.rules]);

  it("disallows the private routes and the filtered listings at a domain root", () => {
    const r = robotsFor("https://exemplo.com.br");
    expect(r.sitemap).toBe("https://exemplo.com.br/sitemap.xml");
    expect(grupos(r)[0]).toEqual({ userAgent: "*", allow: "/", disallow: [...PRIVADAS, ...FILTRADAS] });
  });

  it("names every AI crawler and repeats the same paths for them", () => {
    const [geral, ia] = grupos(robotsFor("https://exemplo.com.br"));
    expect(ia.userAgent).toEqual(expect.arrayContaining(["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]));
    expect({ allow: ia.allow, disallow: ia.disallow }).toEqual({ allow: geral.allow, disallow: geral.disallow });
  });

  it("prefixes every path under a sub-path deploy", () => {
    const r = robotsFor("https://apps.giovaniohira.com/radar/");
    expect(r.sitemap).toBe("https://apps.giovaniohira.com/radar/sitemap.xml");
    expect(grupos(r)[0]).toMatchObject({ allow: "/radar/", disallow: expect.arrayContaining(["/radar/painel", "/radar/entrar", "/radar/buscar?"]) });
  });
});

describe("htmlLimitedBots", () => {
  const re = nextConfig.htmlLimitedBots as RegExp;

  it("puts the metadata in the <head> for every AI crawler named in robots.txt", () => {
    for (const bot of [...ROBOS_IA_BUSCA, ...ROBOS_IA_TREINO]) expect(re.test(`Mozilla/5.0 (compatible; ${bot}/1.0)`), bot).toBe(true);
    expect(re.test("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
  });

  it("keeps the crawlers Next already covered, and leaves people alone", () => {
    for (const ua of ["Bingbot/2.0", "facebookexternalhit/1.1", "Twitterbot/1.0", "WhatsApp/2", "LinkedInBot/1.0"]) expect(re.test(ua), ua).toBe(true);
    expect(re.test("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe(false);
  });
});

describe("schema.org", () => {
  const base = "https://exemplo.com.br";
  const perguntas = [{ q: "Quanto custa?", a: "R$ 97 por mês." }, { q: "Preciso de senha?", a: "Não <b>precisa</b>." }];

  it("states the real price and the company, and never a rating or a review", () => {
    const g = landing(base, perguntas);
    const txt = JSON.stringify(g);
    expect(txt).not.toMatch(/aggregateRating|ratingValue|"review"|reviewCount/i);
    const app = aplicativo(base) as { offers: { price: string; priceCurrency: string; priceSpecification: { billingDuration: string } } };
    expect(app.offers).toMatchObject({ price: "97.00", priceCurrency: "BRL", priceSpecification: { billingDuration: "P1M" } });
    expect(organizacao(base)).toMatchObject({ name: "Vencedital", legalName: expect.stringMatching(/^OHIRA TECNOLOGIA LTDA/) });
    expect(g["@graph"]).toHaveLength(4);
  });

  it("mirrors the FAQ question for question", () => {
    const f = faq(base, perguntas) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(f.mainEntity.map((m) => [m.name, m.acceptedAnswer.text])).toEqual(perguntas.map((p) => [p.q, p.a]));
  });

  it("numbers the breadcrumb from 1 with absolute URLs", () => {
    const t = trilha(base, [{ nome: "Mercado", path: "/mercado" }, { nome: "Município X", path: "/orgao/123" }]) as { itemListElement: { position: number; item: string }[] };
    expect(t.itemListElement).toEqual([
      expect.objectContaining({ position: 1, item: `${base}/mercado` }),
      expect.objectContaining({ position: 2, item: `${base}/orgao/123` }),
    ]);
  });

  it("cannot close the script tag from inside a string", () => {
    expect(serializar({ nome: "</script><script>alert(1)</script>" })).not.toContain("<");
    expect(JSON.parse(serializar({ nome: "a<b" }))).toEqual({ nome: "a<b" });
  });
});

describe("legal copy", () => {
  it("names the company without empty fields", () => {
    expect(quemSomos()).toMatch(/^OHIRA TECNOLOGIA LTDA/);
    expect(quemSomos()).not.toMatch(/null|undefined|, ,|,$/);
  });

  it("never ships a placeholder from the drafts in docs/empresa", () => {
    const arquivos = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
      });
    const achados = arquivos("src").filter((f) => /\{(CNPJ|ENDERECO|CIDADE_FORO|DATA_PUBLICACAO|PRECO|CONTATO|PROVEDOR_\w+|PAIS_\w+|PRAZO_BACKUP|NOME|DOMINIO)\}/.test(readFileSync(f, "utf8")));
    expect(achados).toEqual([]);
  });
});

describe("quem ganhou: palavras do objeto", () => {
  it("keeps the distinctive words, without accents, in order, dropping boilerplate and the buyer's own name", () => {
    expect(termosDoObjeto("Contratação de empresa especializada para a prestação de serviços de manutenção preventiva e corretiva de veículos")).toEqual([
      "manutencao",
      "preventiva",
      "corretiva",
      "veiculos",
    ]);
    // The buyer's name and city are in every one of its contracts, so they say nothing about what is bought.
    expect(termosDoObjeto("Aquisição de colchão para o Hospital de Criciúma", "MUNICIPIO DE CRICIUMA Hospital")).toEqual(["colchao"]);
  });

  it("reads only the start of the text, at most six words, and ignores numbers and short words", () => {
    const longo = `Aquisição de ${"alfa bravo charlie delta echo foxtrot golf hotel ".repeat(3)}`;
    expect(termosDoObjeto(longo)).toEqual(["alfa", "bravo", "charlie", "delta", "echo", "foxtrot"]);
    expect(termosDoObjeto("Compra de 2TB u2013 HD e cabo")).toEqual(["cabo"]);
    expect(termosDoObjeto("")).toEqual([]);
  });

  it("asks for more shared words as the object grows, and gives the index a selective pair query", () => {
    expect([1, 2, 3, 4, 5, 6].map(minimoDePalavras)).toEqual([1, 2, 2, 2, 2, 2]);
    expect(prefiltroGin(["colchao"])).toBe("colchao");
    expect(prefiltroGin(["a1b", "c2d"])).toBe("(a1b & c2d)");
    // Every pair has one of the two leading words, so a contract that matches only trailing words is never required.
    expect(prefiltroGin(["aaaa", "bbbb", "cccc", "dddd"])).toBe("(aaaa & bbbb) | (aaaa & cccc) | (aaaa & dddd) | (bbbb & cccc) | (bbbb & dddd)");
    expect(prefiltroGin([])).toBe("");
  });
});

describe("CNPJ public data", () => {
  it("keeps the city, opening year and activity", async () => {
    const f = (async () =>
      new Response(JSON.stringify({ razao_social: "PADARIA X LTDA", municipio: "PORTO VELHO", uf: "RO", data_inicio_atividade: "2014-03-02", cnae_fiscal_descricao: "Fabricação de produtos de panificação", cnae_fiscal: 1091102 }))) as typeof fetch;
    expect(await consultarCnpj("68631511000145", f)).toMatchObject({ municipio: "PORTO VELHO", abertura: 2014, atividade: "Fabricação de produtos de panificação", cnaes: ["1091102"] });
    expect(formatCnae("1091102")).toBe("1091-1/02");
  });
  it("picks words that repeat across the contracts a company won", () => {
    const objetos = [
      "Aquisição de gêneros alimentícios para a merenda escolar",
      "Registro de preços para fornecimento de pães e gêneros alimentícios",
      "Merenda escolar: pães, bolos e biscoitos",
      "Contratação de empresa especializada em coffee break",
    ];
    expect(palavrasDoHistorico(objetos)).toEqual(["alimentícios", "escolar", "gêneros"]);
    expect(palavrasDoHistorico(objetos, 5)).toEqual(["alimentícios", "escolar", "gêneros", "merenda"]);
    expect(palavrasDoHistorico(["Uma compra só"])).toEqual([]);
  });
  it("suggests the strongest sectors: main CNAE and the words of the company's own contracts", () => {
    // Hospital distributor: a secondary CNAE also matches "limpeza", but its contracts say medicamentos.
    expect(setoresSugeridos(["4645101", "4649408"], ["medicamentos", "suplementos"])).toEqual(["saude"]);
    // Mixed distributor: no main match; the most frequent contract word decides the order.
    expect(setoresSugeridos(["8211300", "4647801", "4639701", "4649408"], ["expediente", "escolar", "limpeza"])).toEqual(["escritorio", "alimentos"]);
    // No history: CNAE alone, main first, a secondary one next to it.
    expect(setoresSugeridos(["4751201", "8121400"], [])).toEqual(["ti", "limpeza"]);
    expect(setoresSugeridos([], [])).toEqual([]);
  });
  it("masks a CNPJ while it is typed", () => {
    expect(mascaraCnpj("6863")).toBe("68.63");
    expect(mascaraCnpj("68631511000145")).toBe("68.631.511/0001-45");
    expect(mascaraCnpj("12abc34501de35xx")).toBe("12.ABC.345/01DE-35");
  });
  it("maps CNAE classes to onboarding sectors, main activity first", () => {
    expect(setoresDoCnae(["8121400", "4751201"])).toEqual(["limpeza", "ti"]);
    expect(setoresDoCnae(["6319400", "4751201", "6201501"])).toEqual(["ti"]);
    expect(setoresDoCnae(["0111301"])).toEqual([]);
    expect(setoresDoCnae([])).toEqual([]);
  });
  it("reads state and CNAEs, and returns null on any failure", async () => {
    const ok = (async () =>
      new Response(JSON.stringify({ razao_social: "EMPRESA X LTDA", uf: "RO", cnae_fiscal: 4751201, cnaes_secundarios: [{ codigo: 0 }, { codigo: 8121400 }] }))) as typeof fetch;
    expect(await consultarCnpj("68631511000145", ok)).toEqual({ razaoSocial: "EMPRESA X LTDA", municipio: null, uf: "RO", abertura: null, atividade: null, cnaes: ["4751201", "8121400"] });
    const notFound = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    expect(await consultarCnpj("68631511000145", notFound)).toBeNull();
    // First source refuses, the fallback answers.
    const urls: string[] = [];
    const fallback = (async (u: string) => {
      urls.push(u);
      return urls.length === 1 ? new Response("Forbidden", { status: 403 }) : new Response(JSON.stringify({ uf: "SP", cnae_fiscal: "6201-5/01" }));
    }) as typeof fetch;
    expect(await consultarCnpj("06990590000123", fallback)).toEqual({ razaoSocial: "", municipio: null, uf: "SP", abertura: null, atividade: null, cnaes: ["6201501"] });
    expect(urls[1]).toBe("https://minhareceita.org/06990590000123");
    // A slow first source eats the 5 s budget: the fallback is not tried past it.
    const lentas: string[] = [];
    const lenta = (async (u: string, init?: RequestInit) => {
      lentas.push(u);
      return new Promise<Response>((_, fail) => init?.signal?.addEventListener("abort", () => fail(new Error("timeout"))));
    }) as typeof fetch;
    const t0 = Date.now();
    expect(await consultarCnpj("06990590000123", lenta, 300)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(lentas).toHaveLength(1);
    const down = (async () => {
      throw new Error("timeout");
    }) as typeof fetch;
    expect(await consultarCnpj("68631511000145", down)).toBeNull();
  });
});
