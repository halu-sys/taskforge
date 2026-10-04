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
    <main className="p-8 max-w-3xl">
      <div className="text-sm text-gray-500 mb-2">
        <Link href={`/org/${slug}/projects/${projectKey}`} className="underline">
          {projectKey} / {task.board.name}
        </Link>
      </div>
      <h1 className="text-xl font-bold mb-4">
        <span className="font-mono text-gray-400 text-sm mr-2">#{task.number}</span>
        {task.title}
      </h1>

      <div className="grid grid-cols-2 gap-4 text-sm mb-6">
        <div>
          <div className="text-gray-500">Status</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "status")}>
            <select name="status" defaultValue={task.status} className="border p-1 rounded">
              {["BACKLOG","TODO","IN_PROGRESS","IN_REVIEW","DONE"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="underline ml-1">Set</button>
          </form>
        </div>
        <div>
          <div className="text-gray-500">Assignee</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "assignee")}>
            <select name="assigneeId" defaultValue={task.assignee?.id ?? ""} className="border p-1 rounded">
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
            <button className="underline ml-1">Set</button>
          </form>
        </div>
        <div>
          <div className="text-gray-500">Priority</div>
          <form action={updateTaskFieldAction.bind(null, org.id, id, "priority")}>
            <select name="priority" defaultValue={task.priority} className="border p-1 rounded">
              {["NONE","LOW","MEDIUM","HIGH","URGENT"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="underline ml-1">Set</button>
          </form>
        </div>
        <div>
          <div className="text-gray-500">Created by {task.createdBy.name}</div>
          <form action={deleteTaskAction.bind(null, org.id, id)} className="mt-2">
            <button className="text-red-600 underline text-sm">Delete task</button>
          </form>
        </div>
      </div>

      <h2 className="font-semibold mb-2">Comments</h2>
      <div className="space-y-3 mb-4">
        {task.comments.map((c) => (
          <div key={c.id} className="border rounded p-3 text-sm">
            <div className="font-semibold">{c.author.name}
              <span className="text-gray-400 font-normal ml-2">{c.createdAt.toISOString().slice(0, 16)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        {task.comments.length === 0 && <p className="text-gray-500 text-sm">No comments yet.</p>}
      </div>
      <form action={addCommentAction.bind(null, org.id, id)} className="flex flex-col gap-2">
        <textarea name="body" required rows={3} placeholder="Comment… (@name to mention)"
          className="border p-2 rounded text-sm" />
        <button className="bg-black text-white px-4 py-1 rounded self-start">Comment</button>
      </form>
    </main>
  );
}
