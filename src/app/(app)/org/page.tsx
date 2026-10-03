import { redirect } from "next/navigation";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function OrgIndexPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const m = await prisma.membership.findFirst({
    where: { userId: session.userId },
    include: { org: true },
    orderBy: { joinedAt: "asc" },
  });
  if (!m) redirect("/login");
  redirect(`/org/${m.org.slug}`);
}
