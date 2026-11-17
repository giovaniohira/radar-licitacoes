"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { trocarEmail } from "../../actions/auth";

export function TrocarEmail({ atual }: { atual: string }) {
  const [state, action, pending] = useActionState(trocarEmail, null);
  if (state?.ok) return <div className="notice ok">{state.ok}</div>;
  return (
    <form action={action} className="stack">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 280px", fontWeight: 550, color: "var(--muted)" }}>
          E-mail de trabalho
          <input className="input" name="email" type="email" required autoComplete="email" defaultValue={atual} style={{ fontSize: 14 }} />
        </label>
        <button type="submit" className="btn" disabled={pending} style={{ height: 38 }}>
          {pending ? "Enviando…" : "Trocar e-mail"}
        </button>
      </div>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}

export function CopiarAgenda({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }}
    >
      <Icon name={copiado ? "check" : "copy"} size={15} /> {copiado ? "Link copiado" : "Copiar link da agenda"}
    </button>
  );
}
