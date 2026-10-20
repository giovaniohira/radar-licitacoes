import { Suspense } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/icons";
import { currentUser } from "@/lib/session";
import { sair } from "../actions/auth";

async function UserBox() {
  const user = await currentUser();
  if (!user) {
    return (
      <Link href="/entrar" className="btn btn-primary" style={{ width: "100%" }}>
        Entrar
      </Link>
    );
  }
  return (
    <div className="user-box">
      <span className="avatar">{user.email[0]}</span>
      <span className="email" title={user.email}>
        {user.demo ? "Conta demo" : user.email}
      </span>
      <form action={sair} style={{ marginLeft: "auto" }}>
        <button className="btn btn-ghost btn-sm" aria-label="Sair" title="Sair">
          <Icon name="logout" size={14} />
        </button>
      </form>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Shell
      user={
        <Suspense fallback={<div className="user-box subtle">…</div>}>
          <UserBox />
        </Suspense>
      }
    >
      {children}
    </Shell>
  );
}
