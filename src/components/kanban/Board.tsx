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
  NONE: "bg-gray-200", LOW: "bg-blue-100", MEDIUM: "bg-yellow-100",
  HIGH: "bg-orange-200", URGENT: "bg-red-200",
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
    <div className="grid grid-cols-5 gap-3 items-start">
      {COLUMNS.map((col) => (
        <div
          key={col.status}
          className="bg-gray-50 rounded p-2 min-h-40"
          onDragOver={(e) => { e.preventDefault(); setOver({ status: col.status, taskId: null }); }}
          onDrop={() => drop(col.status, null)}
        >
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{col.label}</div>
          {columnTasks(col.status).map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver({ status: col.status, taskId: t.id }); }}
              onDrop={(e) => { e.stopPropagation(); drop(col.status, t.id); }}
              className={`bg-white border rounded p-2 mb-2 cursor-grab text-sm ${
                over?.status === col.status && over.taskId === t.id ? "border-black" : ""
              }`}
            >
              <Link href={`/org/${slug}/tasks/${t.id}`} className="block">
                <span className="font-mono text-xs text-gray-400">#{t.number}</span>{" "}
                {t.title}
              </Link>
              <div className="flex gap-1 mt-1 flex-wrap">
                {t.priority !== "NONE" && (
                  <span className={`text-xs px-1 rounded ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                )}
                {t.labels.map((l) => (
                  <span key={l} className="text-xs bg-gray-100 px-1 rounded">{l}</span>
                ))}
                {t.assigneeName && <span className="text-xs text-gray-500">@{t.assigneeName}</span>}
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
      <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-black">
        + new task
      </button>
    );
  }
  return (
    <form
      action={createTaskAction.bind(null, orgId)}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input name="title" required placeholder="Task title" className="border p-1 text-sm rounded" autoFocus />
      <div className="flex gap-1">
        <button className="bg-black text-white text-xs px-2 rounded">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500">Cancel</button>
      </div>
    </form>
  );
}
