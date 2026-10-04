import Link from "next/link";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { logoutAction } from "@/server/auth/actions";
import { switchOrgAction } from "@/server/services/org-actions";
import NotificationBell from "@/components/NotificationBell";
import SearchBox from "@/components/SearchBox";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) return null; // middleware redirects
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface px-4 py-2.5 flex items-center gap-4 text-sm sticky top-0 z-20">
        <Link href="/org" className="font-bold tracking-tight text-base">TaskForge</Link>
        <form action={switchOrgAction} className="flex items-center gap-1.5">
          <select name="slug" className="select text-sm py-1"
            defaultValue={memberships[0]?.org.slug ?? ""}>
            {memberships.map((m) => (
              <option key={m.org.id} value={m.org.slug}>{m.org.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost text-sm py-1">Switch</button>
        </form>
        <nav className="flex gap-1 ml-auto">
          {memberships.map((m) => (
            <Link key={m.org.id} href={`/org/${m.org.slug}`} className="btn btn-ghost">
              {m.org.name}
            </Link>
          ))}
        </nav>
        <SearchBox />
        <NotificationBell userId={user.id} />
        <span className="muted">{user.name || user.email}</span>
        <form action={logoutAction}>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
