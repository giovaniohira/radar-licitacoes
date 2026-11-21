import { Suspense } from "react";
import Link from "next/link";
import { ContaLink, Shell } from "@/components/Shell";
import { Icon } from "@/components/icons";
import { currentUser } from "@/lib/session";
import { sair } from "../actions/auth";

async function UserBox() {
  const user = await currentUser();
  if (!user) {
    return (
      <Link href="/entrar" className="btn btn-primary btn-block">
        Entrar
      </Link>
    );
  }
  return (
    <div className="user-box">
      <Suspense>
        <ContaLink email={user.email} />
      </Suspense>
      <form action={sair}>
        <button className="btn btn-ghost btn-icon" aria-label="Sair" title="Sair">
          <Icon name="logout" size={15} />
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
