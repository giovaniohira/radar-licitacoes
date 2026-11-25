import { frase, tituloCurto } from "./format";

/** The edital's object as a short title. PNCP objects sometimes start with a stray dash or bullet, which would head the title. */
export function tituloEdital(objeto: string, max: number): string {
  return tituloCurto(frase(objeto).replace(/^[\s\-–—•:;,.]+/, ""), max);
}
