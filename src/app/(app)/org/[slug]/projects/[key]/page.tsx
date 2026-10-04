import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { getProjectByKey } from "@/server/services/projects";
import { NotFoundError, ForbiddenError } from "@/server/errors";
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
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) redirect(`/org/${slug}`);
    throw e;
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
    <main className="page">
      <h1 className="h1 mb-1">
        <span className="font-mono faint text-sm mr-2">{project.key}</span>
        {project.name}
      </h1>
      <p className="text-sm muted mb-6">{primary.name}</p>
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
