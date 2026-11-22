import { describe, expect, it } from "vitest";
import { renderAvisoCertidoes, renderDigest, avisosDasCertidoes, type Alert } from "@/lib/alerts";
import {
  DIAS_DE_AVISO,
  TIPOS_FIXOS,
  certidoesParaAvisar,
  diasAte,
  estadoDaCertidao,
  hojeBR,
  nomeDaCertidao,
  selosDoPipeline,
  textoDoAviso,
  textoDoSelo,
  validarEntrada,
  venceAntesDaSessao,
  type Certidao,
} from "@/lib/certidoes";
import type { EditalResumo } from "@/lib/search";

const HOJE = "2026-11-23";
const somar = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const cert = (tipo: string, dias: number, id = 1, nome: string | null = null): Certidao => ({ id, tipo, nome, valida_ate: somar(HOJE, dias) });

describe("estado da certidão nos limites", () => {
  it.each([
    [-5, "vencida", "vencida há 5 dias", "danger"],
    [-1, "vencida", "vencida ontem", "danger"],
    [0, "hoje", "vence hoje", "danger"],
    [1, "vence", "vence amanhã", "warn"],
    [2, "vence", "vence em 2 dias", "warn"],
    [7, "vence", "vence em 7 dias", "warn"],
    [8, "em_dia", "em dia", "ok"],
    [400, "em_dia", "em dia", "ok"],
  ])("%i dias -> %s", (dias, estado, texto, tom) => {
    expect(estadoDaCertidao(somar(HOJE, dias), HOJE)).toMatchObject({ estado, texto, tom, dias });
  });

  it("counts whole days across month and year ends", () => {
    expect(diasAte("2027-01-01", "2026-12-31")).toBe(1);
    expect(diasAte("2026-03-01", "2026-02-28")).toBe(1);
    expect(diasAte("2028-03-01", "2028-02-28")).toBe(2); // leap year
  });

  it("reads 'today' in Brasília time", () => {
    expect(hojeBR(new Date("2026-11-23T02:30:00Z"))).toBe("2026-11-22"); // still the 22nd there
    expect(hojeBR(new Date("2026-11-23T03:00:00Z"))).toBe("2026-11-23");
  });
});

describe("avisos do e-mail", () => {
  it("warns on days 7, 3, 1 and 0 only", () => {
    const cs = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((d, i) => cert("federal", d, i + 1));
    expect(DIAS_DE_AVISO).toEqual([7, 3, 1, 0]);
    expect(certidoesParaAvisar(cs, HOJE).map((c) => diasAte(c.valida_ate, HOJE))).toEqual([0, 1, 3, 7]);
  });

  it("writes the warning like the spec", () => {
    expect(textoDoAviso(cert("fgts", 3), HOJE)).toBe("Sua CRF do FGTS vence em 3 dias.");
    expect(textoDoAviso(cert("trabalhista", 1), HOJE)).toBe("Sua CNDT vence amanhã.");
    expect(textoDoAviso(cert("federal", 0), HOJE)).toBe("Sua certidão federal vence hoje.");
    expect(textoDoAviso(cert("outra", 7, 1, "Alvará"), HOJE)).toBe('Sua certidão "Alvará" vence em 7 dias.');
  });

  it("puts the warning at the top of the digest, with a renew link only when we know one", () => {
    const alert = { id: 1, user_id: 1, nome: "TI", palavras: "x", ufs: [], modalidades: [], valor_min: null, valor_max: null } as Alert;
    const edital = { id: "e1", objeto: "NOTEBOOKS", orgao: "ORGAO", municipio: "X", uf: "PR", modalidade: "Pregão", valor_estimado: 1000, encerramento: new Date("2026-12-10T12:00:00Z") } as EditalResumo;
    const avisos = avisosDasCertidoes([cert("fgts", 3, 1), cert("estadual", 1, 2), cert("federal", 20, 3)], HOJE);
    expect(avisos.map((a) => a.texto)).toEqual(["Sua CRF do FGTS vence em 3 dias.", "Sua certidão estadual vence amanhã."]);

    const com = renderDigest("https://x.test", [{ alert, editais: [edital] }], new Date("2026-11-23T10:00:00Z"), new Map(), avisos);
    expect(com.html.indexOf("Sua CRF do FGTS vence em 3 dias.")).toBeLessThan(com.html.indexOf("Notebooks"));
    expect(com.html).toContain("Emitir →");
    expect(com.html).toContain("https://consulta-crf.caixa.gov.br/");
    expect(com.html).toContain("https://x.test/certidoes");
    expect(com.html.match(/Emitir →/g)?.length).toBe(1); // the estadual one has no link
    expect(com.text).toContain("Certidões:\n- Sua CRF do FGTS vence em 3 dias. Emitir: https://consulta-crf.caixa.gov.br");
    expect(com.subject).toBe("1 novo edital para você");

    const sem = renderDigest("https://x.test", [{ alert, editais: [edital] }], new Date("2026-11-23T10:00:00Z"));
    expect(sem.html).not.toContain("Certidões");
    expect(sem.text).not.toContain("Certidões");
  });

  it("has a short e-mail for a user with no new edital", () => {
    const um = renderAvisoCertidoes("https://x.test", avisosDasCertidoes([cert("fgts", 3)], HOJE));
    expect(um.subject).toBe("Sua CRF do FGTS vence em 3 dias");
    expect(um.html).toContain("Ver minhas certidões");
    expect(um.text).toContain("https://x.test/certidoes");
    const dois = renderAvisoCertidoes("https://x.test", avisosDasCertidoes([cert("fgts", 3, 1), cert("trabalhista", 0, 2)], HOJE));
    expect(dois.subject).toBe("2 certidões vencendo");
  });
});

describe("selo: a certidão vence antes da sessão", () => {
  it("flags a certificate that expires before the session, not on the same day", () => {
    const fgts = cert("fgts", 5); // valid through 28/11
    expect(venceAntesDaSessao([fgts], "2026-11-29T13:00:00Z", HOJE).map((c) => c.tipo)).toEqual(["fgts"]);
    expect(venceAntesDaSessao([fgts], "2026-11-28T13:00:00Z", HOJE)).toEqual([]); // the day it expires it is still valid
    expect(venceAntesDaSessao([fgts], "2026-11-20T13:00:00Z", HOJE)).toEqual([]); // session already over
    expect(venceAntesDaSessao([fgts], null, HOJE)).toEqual([]);
  });

  it("uses the Brasília day of the session", () => {
    const fgts = cert("fgts", 5); // through 28/11
    // 29/11 01:00 UTC is still 28/11 22:00 in Brasília: not after the expiry.
    expect(venceAntesDaSessao([fgts], "2026-11-29T01:00:00Z", HOJE)).toEqual([]);
    expect(venceAntesDaSessao([fgts], "2026-11-29T03:00:00Z", HOJE)).toHaveLength(1);
  });

  it("marks only active cards, using the later of the opening and the deadline", () => {
    const cs = [cert("fgts", 5, 1), cert("federal", 60, 2)];
    const itens = [
      { edital_id: "a", etapa: "triagem", abertura: new Date("2026-12-05T13:00:00Z"), encerramento: new Date("2026-11-25T13:00:00Z") },
      { edital_id: "b", etapa: "ganha", abertura: new Date("2026-12-05T13:00:00Z"), encerramento: null },
      { edital_id: "c", etapa: "preparando", abertura: null, encerramento: new Date("2026-11-26T13:00:00Z") },
      { edital_id: "d", etapa: "enviada", abertura: null, encerramento: new Date("2026-12-30T13:00:00Z") },
    ];
    const selos = selosDoPipeline(itens, cs, HOJE);
    expect([...selos.keys()]).toEqual(["a", "d"]); // c closes before the expiry, b is finished
    // The opening is when proposals start to be received: an old one must not hide a deadline that falls after the expiry.
    const antiga = [{ edital_id: "x", etapa: "analise", abertura: new Date("2026-11-10T13:00:00Z"), encerramento: new Date("2026-12-10T13:00:00Z") }];
    expect([...selosDoPipeline(antiga, cs, HOJE).keys()]).toEqual(["x"]);
    expect(selos.get("a")!.map((c) => c.tipo)).toEqual(["fgts"]);
    expect(selos.get("d")!.map((c) => c.tipo)).toEqual(["fgts"]); // the federal one is valid until 22/01/2027, after this session
    expect(textoDoSelo(selos.get("a")!)).toBe("Vence antes da sessão: CRF do FGTS");
    expect(selosDoPipeline(itens, [], HOJE).size).toBe(0);
  });
});

describe("validarEntrada e links", () => {
  it("accepts real dates and rejects the rest", () => {
    expect(validarEntrada({ tipo: "fgts", validaAte: "2026-12-31" })).toBeNull();
    expect(validarEntrada({ tipo: "fgts", validaAte: "" })).toMatch(/data de validade/);
    expect(validarEntrada({ tipo: "fgts", validaAte: "2026-02-30" })).toMatch(/não existe/);
    expect(validarEntrada({ tipo: "fgts", validaAte: "1999-01-01" })).toMatch(/ano/);
    expect(validarEntrada({ tipo: "xyz", validaAte: "2026-12-31" })).toMatch(/inválido/);
    expect(validarEntrada({ tipo: "outra", nome: " ", validaAte: "2026-12-31" })).toMatch(/nome/);
    expect(validarEntrada({ tipo: "outra", nome: "x".repeat(61), validaAte: "2026-12-31" })).toMatch(/60/);
    expect(validarEntrada({ tipo: "outra", id: 3, nome: "", validaAte: "2026-12-31" })).toBeNull(); // editing keeps the name
  });

  it("pins the official issue links to the government sites", () => {
    const hosts = Object.fromEntries(TIPOS_FIXOS.map((t) => [t.id, t.link && new URL(t.link).hostname]));
    expect(hosts).toEqual({ federal: "www.gov.br", fgts: "consulta-crf.caixa.gov.br", trabalhista: "cndt-certidao.tst.jus.br", estadual: null, municipal: null });
    expect(TIPOS_FIXOS.every((t) => !t.link || t.link.startsWith("https://"))).toBe(true);
    expect(nomeDaCertidao({ tipo: "outra", nome: null })).toBe("Outra certidão");
  });
});
