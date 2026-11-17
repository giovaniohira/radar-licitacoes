"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Icon, Logo, type IconName } from "./icons";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/painel", label: "Hoje", icon: "home" },
  { href: "/buscar", label: "Encontrar editais", icon: "search" },
  { href: "/pipeline", label: "Minhas disputas", icon: "kanban" },
  { href: "/alertas", label: "Alertas", icon: "bell" },
  { href: "/mercado", label: "Mercado", icon: "chart" },
];

function Nav({ path }: { path: string }) {
  return (
    <nav aria-label="Principal" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV.map((n) => {
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} className="nav-item" aria-current={active ? "page" : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

// The pathname is request data, so it streams in behind Suspense; the static shell shows the nav without a highlight.
function ActiveNav() {
  return <Nav path={usePathname()} />;
}

export function Shell({ user, children }: { user: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Ctrl/Cmd+K jumps to search from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/buscar");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className={`app${open ? " nav-open" : ""}`}>
      {/* Any link click inside the mobile drawer closes it. */}
      <aside className="sidebar" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
        <Logo href="/painel" />
        <Link href="/buscar" className="cmdk">
          <Icon name="search" size={15} />
          <span>Buscar editais</span>
          <kbd>Ctrl K</kbd>
        </Link>
        <Suspense fallback={<Nav path="" />}>
          <ActiveNav />
        </Suspense>
        <div className="foot">{user}</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div id="conteudo" className="main">
        <div className="topbar">
          <button className="btn btn-ghost btn-icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <Logo href="/painel" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Sidebar footer link to /conta; highlighted while on that page. */
export function ContaLink({ email }: { email: string }) {
  const path = usePathname();
  return (
    <Link href="/conta" className="user-link" aria-current={path === "/conta" ? "page" : undefined}>
      <span className="avatar">{email.slice(0, 2)}</span>
      <span style={{ minWidth: 0 }}>
        <b>Conta</b>
        <small>{email}</small>
      </span>
    </Link>
  );
}
