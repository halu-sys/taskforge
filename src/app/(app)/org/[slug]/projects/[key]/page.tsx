import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { getProjectByKey } from "@/server/services/projects";
import { listBoardTasks } from "@/server/services/tasks";
import Board from "@/components/kanban/Board";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const { slug, key } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");

  let project;
  try {
    project = await getProjectByKey(org.id, session.userId, key);
  } catch {
    redirect(`/org/${slug}`);
  }

  const boards = project.boards;
  const primary = boards[0];
  if (!primary) redirect(`/org/${slug}`);
  const tasks = await listBoardTasks(org.id, session.userId, primary.id);
  const members = await prisma.membership.findMany({
    where: { orgId: org.id },
    include: { user: { select: { id: true, name: true } } },
  });

  return (
    <main className="p-8">
      <h1 className="text-xl font-bold mb-1">
        <span className="font-mono text-gray-500 text-sm mr-2">{project.key}</span>
        {project.name}
      </h1>
      <p className="text-sm text-gray-500 mb-6">{primary.name}</p>
      <Board
        orgId={org.id}
        boardId={primary.id}
        slug={slug}
        tasks={tasks.map((t) => ({
          id: t.id, number: t.number, title: t.title, status: t.status,
          priority: t.priority, position: t.position, labels: t.labels,
          assigneeName: t.assignee?.name ?? null,
        }))}
        members={members.map((m) => m.user)}
      />
    </main>
  );
}
