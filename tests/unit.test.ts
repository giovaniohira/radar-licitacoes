import { describe, expect, it } from "vitest";
import { hashToken, newLoginToken, normalizeEmail, signSession, verifySession } from "@/lib/auth";
import { renderDigest, type Alert } from "@/lib/alerts";
import { formatBRL, prazo } from "@/lib/format";
import { dias, hojeBR } from "@/lib/ingest";
import { parseFiltros, parseValor } from "@/lib/params";
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
    expect(prazo(null, now)).toBe("prazo não informado");
  });
  it("treats 0 as secret budget", () => {
    expect(formatBRL(0)).toBe("valor sigiloso ou não informado");
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
