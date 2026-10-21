import { describe, expect, it } from "vitest";
import { hashToken, icsToken, newLoginToken, normalizeEmail, signSession, verifyIcsToken, verifySession } from "@/lib/auth";
import { renderDigest, type Alert } from "@/lib/alerts";
import { formatBRL, formatDia, frase, nome, prazo, prazoTom } from "@/lib/format";
import { dias, hojeBR } from "@/lib/ingest";
import { parseFiltros, parseValor, withParams } from "@/lib/params";
import { whereContratos } from "@/lib/mercado";
import { fold, renderIcs, vencendo, type PipelineItem } from "@/lib/pipeline";
import { buildSearch, toWebsearch, type EditalResumo } from "@/lib/search";

const KEY = "k".repeat(40);

describe("session", () => {
  it("round-trips and rejects tampering", () => {
    const now = Date.UTC(2026, 9, 16);
    const s = signSession(42, now, KEY);
    expect(verifySession(s, now, KEY)).toBe(42);
    expect(verifySession(s.replace(/^42/, "43"), now, KEY)).toBeNull();
    expect(verifySession(s, now, "x".repeat(40))).toBeNull();
    expect(verifySession("lixo", now, KEY)).toBeNull();
    expect(verifySession(undefined, now, KEY)).toBeNull();
  });
  it("expires after 30 days", () => {
    const now = Date.UTC(2026, 9, 16);
    const s = signSession(1, now, KEY);
    expect(verifySession(s, now + 29 * 86400_000, KEY)).toBe(1);
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
    expect(prazoTom("2026-10-17T12:00:00Z", now)).toBe("danger");
    expect(prazoTom("2026-10-21T12:00:00Z", now)).toBe("warn");
    expect(prazoTom("2026-11-30T12:00:00Z", now)).toBe("ok");
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
