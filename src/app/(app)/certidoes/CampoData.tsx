"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

/** The date field and its Save button: the button is the dark primary one only once the date was changed. */
export function CampoData({ rotulo, inicial }: { rotulo: string; inicial: string }) {
  const [valor, setValor] = useState(inicial);
  const alterada = valor !== inicial && valor !== "";
  return (
    <>
      <label className="cert-data">
        <span className="sr-only">Válida até, {rotulo}</span>
        <span className="xs muted">Válida até</span>
        <input
          className="input"
          type="date"
          lang="pt-BR"
          name="valida_ate"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
          min="2000-01-01"
          max="2100-12-31"
        />
      </label>
      <SubmitButton className={alterada ? "btn btn-primary btn-sm" : "btn btn-sm"}>Salvar</SubmitButton>
    </>
  );
}
