"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTaskAction, moveTaskAction } from "@/server/services/task-actions";
import Link from "next/link";
import type { TaskStatus, TaskPriority } from "@prisma/client";

export type BoardTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  labels: string[];
  assigneeName: string | null;
};

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "DONE", label: "Done" },
];

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  NONE: "", LOW: "badge", MEDIUM: "badge badge-warn",
  HIGH: "badge badge-warn", URGENT: "badge badge-danger",
};

export default function Board({
  orgId, boardId, slug, tasks: initial, members,
}: {
  orgId: string;
  boardId: string;
  slug: string;
  tasks: BoardTask[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; taskId: string | null } | null>(null);

  function columnTasks(status: TaskStatus) {
    return tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
  }

  function computePosition(status: TaskStatus, beforeId: string | null): number {
    const col = columnTasks(status).filter((t) => t.id !== dragId);
    const idx = beforeId === null ? col.length : col.findIndex((t) => t.id === beforeId);
    const before = idx > 0 ? col[idx - 1].position : null;
    const after = idx < col.length ? col[idx].position : null;
    if (before === null && after === null) return 1000;
    if (before === null) return after! - 1000;
    if (after === null) return before + 1000;
    return (before + after) / 2;
  }

  async function drop(status: TaskStatus, beforeId: string | null) {
    if (!dragId) return;
    const position = computePosition(status, beforeId);
    const snapshot = tasks;
    setTasks((ts) => ts.map((t) => (t.id === dragId ? { ...t, status, position } : t)));
    setDragId(null);
    setOver(null);
    try {
      await moveTaskAction(orgId, dragId, { boardId, status, position });
    } catch {
      setTasks(snapshot); // rollback optimistic update on failure
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
      {COLUMNS.map((col) => (
        <div
          key={col.status}
          className={`rounded-lg p-2 min-h-40 border transition-colors ${
            over?.status === col.status && over.taskId === null
              ? "bg-accent-soft border-accent"
              : "bg-surface2 border-line"
          }`}
          onDragOver={(e) => { e.preventDefault(); setOver({ status: col.status, taskId: null }); }}
          onDrop={() => drop(col.status, null)}
        >
          <div className="text-xs font-semibold muted uppercase tracking-wide mb-2 px-1">
            {col.label}
            <span className="badge ml-2">{columnTasks(col.status).length}</span>
          </div>
          {columnTasks(col.status).map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver({ status: col.status, taskId: t.id }); }}
              onDrop={(e) => { e.stopPropagation(); drop(col.status, t.id); }}
              className={`card p-2.5 mb-2 cursor-grab text-sm hover:shadow-lg transition-shadow ${
                dragId === t.id ? "opacity-40" : ""
              } ${over?.status === col.status && over.taskId === t.id ? "outline outline-2 outline-accent" : ""}`}
            >
              <Link href={`/org/${slug}/tasks/${t.id}`} className="block">
                <span className="font-mono text-xs faint">#{t.number}</span>{" "}
                {t.title}
              </Link>
              <div className="flex gap-1 mt-1.5 flex-wrap items-center">
                {t.priority !== "NONE" && (
                  <span className={PRIORITY_COLOR[t.priority]}>{t.priority}</span>
                )}
                {t.labels.map((l) => (
                  <span key={l} className="badge">{l}</span>
                ))}
                {t.assigneeName && <span className="text-xs muted ml-auto">@{t.assigneeName}</span>}
              </div>
            </div>
          ))}
          <NewTaskForm orgId={orgId} boardId={boardId} status={col.status} onDone={() => router.refresh()} />
        </div>
      ))}
    </div>
  );
}

function NewTaskForm({ orgId, boardId, status, onDone }: {
  orgId: string; boardId: string; status: TaskStatus; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost text-xs w-full justify-start faint hover:text-inherit">
        + new task
      </button>
    );
  }
  return (
    <form
      action={createTaskAction.bind(null, orgId)}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input name="title" required placeholder="Task title" className="input text-sm py-1.5" autoFocus />
      <div className="flex gap-1.5">
        <button className="btn btn-primary text-xs py-1">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost text-xs py-1">Cancel</button>
      </div>
    </form>
  );
}
