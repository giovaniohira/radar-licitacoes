import { ImageResponse } from "next/og";

export const alt = "Radar de Licitações: os editais do PNCP que combinam com sua empresa, no seu e-mail às 7h";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default share image for every page; colors mirror --ink / --accent in globals.css.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#0f2a22", color: "#eef2ee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 600 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: "#0d5c45", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#eef2ee" strokeWidth="2" strokeLinecap="round">
              <path d="M19.07 4.93A10 10 0 1 0 22 12M12 12l7-7M16.24 7.76A6 6 0 1 0 18 12M12 12h.01" />
            </svg>
          </div>
          Radar de Licitações
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Nunca mais perca um edital que sua empresa podia ganhar.</div>
          <div style={{ fontSize: 32, color: "#b4c4bb" }}>Alertas diários do PNCP, resumo do edital por IA e pipeline de propostas.</div>
        </div>
      </div>
    ),
    size,
  );
}
