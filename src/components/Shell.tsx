"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Icon, Logo, type IconName } from "./icons";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/painel", label: "Visão geral", icon: "home" },
  { href: "/buscar", label: "Buscar editais", icon: "search" },
  { href: "/pipeline", label: "Pipeline", icon: "kanban" },
  { href: "/alertas", label: "Alertas", icon: "bell" },
];

const INTEL: { href: string; label: string; icon: IconName }[] = [{ href: "/mercado", label: "Mercado", icon: "chart" }];

function NavItem({ href, label, icon, path }: { href: string; label: string; icon: IconName; path: string }) {
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className="nav-item" aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      {label}
    </Link>
  );
}

function Nav({ path }: { path: string }) {
  return (
    <>
      {NAV.map((n) => (
        <NavItem key={n.href} {...n} path={path} />
      ))}
      <div className="nav-label">Inteligência</div>
      {INTEL.map((n) => (
        <NavItem key={n.href} {...n} path={path} />
      ))}
    </>
  );
}

// The pathname is request data, so it streams in behind Suspense; the static shell shows the nav without a highlight.
function ActiveNav() {
  return <Nav path={usePathname()} />;
}

export function Shell({ user, children }: { user: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`app${open ? " nav-open" : ""}`}>
      {/* Any link click inside the mobile drawer closes it. */}
      <aside className="sidebar" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
        <Link href="/">
          <Logo />
        </Link>
        <Suspense fallback={<Nav path="" />}>
          <ActiveNav />
        </Suspense>
        <div className="foot">{user}</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <div className="topbar">
          <button className="btn btn-ghost" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <Link href="/">
            <Logo />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
