"use server";

import { redirect } from "next/navigation";
import { createProjectWithBoard } from "@/server/services/projects";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function createProjectAction(orgId: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const project = await createProjectWithBoard(orgId, session.userId, String(fd.get("name") ?? ""));
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/projects/${project.key}`);
}
