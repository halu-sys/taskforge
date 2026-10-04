"use server";

import { redirect } from "next/navigation";
import { createProject } from "@/server/services/projects";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function createProjectAction(orgId: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const project = await createProject(orgId, session.userId, String(fd.get("name") ?? ""));
  // Every project gets a default board.
  await prisma.board.create({ data: { projectId: project.id, name: "Main" } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/projects/${project.key}`);
}
