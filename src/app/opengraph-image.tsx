import { ImageResponse } from "next/og";

export const alt = "Radar de Licitações: os editais do PNCP que combinam com sua empresa, no seu e-mail às 7h";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default share image for every page; colors mirror --navy / --brand in globals.css.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#1E293B", color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="48" height="48" viewBox="0 0 32 32">
              <rect x="6" y="5" width="6.5" height="22" rx="1" fill="#FFFFFF" />
              <path d="M12.5 5H16a6.5 6.5 0 0 1 0 13h-3.5z" fill="#F97316" />
              <path d="M13.5 18 26 27H17.5z" fill="#FFFFFF" />
            </svg>
          </div>
          radar licitações
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Nunca mais perca um edital que sua empresa podia ganhar.</div>
          <div style={{ fontSize: 32, color: "#FDBA74" }}>Alertas diários do PNCP, resumo do edital por IA e controle das suas disputas.</div>
        </div>
      </div>
    ),
    size,
  );
}
