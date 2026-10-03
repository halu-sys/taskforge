"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE } from "@/server/cookies";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function switchOrgAction(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await currentSession();
  if (!slug || !session) redirect("/org");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");
  const m = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: session.userId } },
  });
  if (!m) redirect("/org");
  const store = await cookies();
  store.set(ORG_COOKIE, slug, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect(`/org/${slug}`);
}
