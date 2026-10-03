import { redirect } from "next/navigation";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { createOrg } from "@/server/services/orgs";

export default async function OrgIndexPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const m = await prisma.membership.findFirst({
    where: { userId: session.userId },
    include: { org: true },
    orderBy: { joinedAt: "asc" },
  });
  if (!m) {
    // No orgs left (e.g. removed from all): create a fresh personal workspace.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    const slug = await createOrg(session.userId, `${user.name}'s Workspace`);
    redirect(`/org/${slug}`);
  }
  redirect(`/org/${m.org.slug}`);
}
