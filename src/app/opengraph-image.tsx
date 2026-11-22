import { ImageResponse } from "next/og";
import { MARK } from "@/components/icons";

export const alt = "Vencedital: os editais do seu ramo chegam às 7h. Você abre, a IA resume.";
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
              <path d={MARK.esquerda} fill="#FFFFFF" />
              <path d={MARK.direita} fill="#F97316" />
            </svg>
          </div>
          vencedital
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Os editais do seu ramo chegam às 7h.</div>
          <div style={{ fontSize: 32, color: "#FDBA74" }}>A IA resume os editais que você abrir. Você acompanha prazos e documentos.</div>
        </div>
      </div>
    ),
    size,
  );
}
