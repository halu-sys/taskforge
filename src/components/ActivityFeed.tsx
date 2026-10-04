import { listActivity } from "@/server/services/activity";

const VERB_LABEL: Record<string, string> = {
  "task.created": "created task",
  "task.updated": "updated task",
  "task.moved": "moved task",
  "task.deleted": "deleted task",
  "comment.added": "commented",
  "member.joined": "joined",
};

export default async function ActivityFeed({ orgId, userId }: { orgId: string; userId: string }) {
  const events = await listActivity(orgId, userId, 30);
  return (
    <section className="mt-10">
      <h2 className="h2 mb-3">Activity</h2>
      <ul className="space-y-2 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className="faint w-32 shrink-0 font-mono text-xs pt-0.5">{e.createdAt.toISOString().slice(5, 16).replace("T", " ")}</span>
            <span>
              <b>{e.actor?.name ?? "system"}</b> {VERB_LABEL[e.verb] ?? e.verb}
              {e.payload && "title" in (e.payload as object) && (
                <span className="muted"> “{(e.payload as { title?: string }).title}”</span>
              )}
            </span>
          </li>
        ))}
        {events.length === 0 && <li className="muted">No activity yet.</li>}
      </ul>
    </section>
  );
}
