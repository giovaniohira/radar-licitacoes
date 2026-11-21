import Link from "next/link";

// Small inline icon set (24px grid, stroke icons), so the app ships no icon library.
const PATHS = {
  home: "M3 11 12 4l9 7M5 10v10h14V10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  kanban: "M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  external: "M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  sparkle: "M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className, strokeWidth = 2 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The V mark on a 32px grid: white left arm, orange right arm (it reads as a check). Shared with icon.svg and the OG image. */
export const MARK = {
  esquerda: "M5 7h6l8 19h-6z",
  direita: "M21 7h6l-8 19-3-7.125z",
};

/** Colors are fixed: the mark always sits on navy. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d={MARK.esquerda} fill="#FFFFFF" />
      <path d={MARK.direita} fill="#F97316" />
    </svg>
  );
}

/** Mark + "vencedital" wordmark. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Vencedital, página inicial">
      <span className="logo-mark">
        <Mark />
      </span>
      <span className="logo-word">vencedital</span>
    </Link>
  );
}
