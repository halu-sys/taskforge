import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";

export default async function OrgSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: session.userId } },
  });
  if (!membership) redirect("/org");
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">{org.name}</h1>
      <p className="text-gray-500 mt-2">
        Workspace placeholder — boards and tasks arrive in Plan 2.
      </p>
    </main>
  );
}
