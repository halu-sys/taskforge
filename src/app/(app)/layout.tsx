import Link from "next/link";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { logoutAction } from "@/server/auth/actions";
import { switchOrgAction } from "@/server/services/org-actions";

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
    <div>
      <header className="border-b p-3 flex items-center gap-4 text-sm">
        <Link href="/org" className="font-bold">TaskForge</Link>
        <form action={switchOrgAction} className="flex items-center gap-1">
          <select name="slug" className="border p-1 rounded text-sm"
            defaultValue={memberships[0]?.org.slug ?? ""}>
            {memberships.map((m) => (
              <option key={m.org.id} value={m.org.slug}>{m.org.name}</option>
            ))}
          </select>
          <button className="underline">Switch</button>
        </form>
        <nav className="flex gap-3 ml-auto">
          {memberships.map((m) => (
            <Link key={m.org.id} href={`/org/${m.org.slug}`} className="hover:underline">
              {m.org.name}
            </Link>
          ))}
        </nav>
        <span className="text-gray-500">{user.email}</span>
        <form action={logoutAction}>
          <button className="underline">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
