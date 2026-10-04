import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { getTask } from "@/server/services/tasks";
import { addCommentAction, updateTaskFieldAction, deleteTaskAction } from "@/server/services/task-actions";
import Link from "next/link";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");

  let task;
  try {
    task = await getTask(org.id, session.userId, id);
  } catch {
    redirect(`/org/${slug}`);
  }

  const members = await prisma.membership.findMany({
    where: { orgId: org.id },
    include: { user: { select: { id: true, name: true } } },
  });
  const projectKey = task.board.project.key;

  return (
    <main className="page-narrow">
      <div className="text-sm muted mb-2">
        <Link className="link" href={`/org/${slug}/projects/${projectKey}`}>
          {projectKey} / {task.board.name}
        </Link>
      </div>
      <h1 className="h1 mb-6">
        <span className="font-mono faint text-sm mr-2">#{task.number}</span>
        {task.title}
      </h1>

      <div className="card p-4 grid grid-cols-2 gap-4 text-sm mb-8">
        <div>
          <div className="muted mb-1">Status</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "status")} className="flex gap-1.5">
            <select name="status" defaultValue={task.status} className="select py-1">
              {["BACKLOG","TODO","IN_PROGRESS","IN_REVIEW","DONE"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="btn py-1">Set</button>
          </form>
        </div>
        <div>
          <div className="muted mb-1">Assignee</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "assignee")} className="flex gap-1.5">
            <select name="assigneeId" defaultValue={task.assignee?.id ?? ""} className="select py-1">
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
            <button className="btn py-1">Set</button>
          </form>
        </div>
        <div>
          <div className="muted mb-1">Priority</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "priority")} className="flex gap-1.5">
            <select name="priority" defaultValue={task.priority} className="select py-1">
              {["NONE","LOW","MEDIUM","HIGH","URGENT"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="btn py-1">Set</button>
          </form>
        </div>
        <div>
          <div className="muted">Created by {task.createdBy.name}</div>
          <form action={deleteTaskAction.bind(null, org.id, id)} className="mt-2">
            <button className="btn btn-danger text-sm py-1">Delete task</button>
          </form>
        </div>
      </div>

      <h2 className="h2 mb-3">Comments</h2>
      <div className="space-y-3 mb-4">
        {task.comments.map((c) => (
          <div key={c.id} className="card p-3 text-sm">
            <div className="font-semibold">{c.author.name}
              <span className="faint font-normal ml-2">{c.createdAt.toISOString().slice(0, 16)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        {task.comments.length === 0 && <p className="muted text-sm">No comments yet.</p>}
      </div>
      <form action={addCommentAction.bind(null, org.id, id)} className="flex flex-col gap-2">
        <textarea name="body" required rows={3} placeholder="Comment… (@name to mention)"
          className="input" />
        <button className="btn btn-primary self-start">Comment</button>
      </form>
    </main>
  );
}
