# TaskForge Plan 2 — Core Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working project-management product: projects with boards, drag-and-drop kanban tasks, comments, org activity feed, notifications, and search — all tenant-isolated.

**Architecture:** Server Components read via services; Server Actions mutate via services; every service call re-checks membership (Plan 1 guards). Kanban drag-drop = client component posting to a move action; positions are floats with rebalance.

**Tech Stack:** unchanged (Next 16 App Router, Prisma 6, Postgres, Tailwind, vitest).

**Spec:** `docs/superpowers/specs/2026-10-04-taskforge-design.md` §4 "Core product"

## Global Constraints

- Every mutation service signature `(orgId, actorId, ...)` → requireMembership/requireRole first (Plan 1 invariant).
- Task numbers are per-project sequential (`Project.nextNumber` counter added in migration).
- Position: float; on move, midpoint between neighbors; rebalance (rewrite 0..n step 1000) when gap < 0.01.
- Activity events written in the same transaction as the mutation that causes them.
- Notifications created on: task assigned, @mention in comment (match member names), invitation accepted.
- Search: Postgres ILIKE on task title/description + project name; no tsvector (YAGNI at demo scale).
- TDD per task; commit per task; `npm test` green before commit.

## File Structure

```
prisma/schema.prisma            # + Project.nextNumber, Task.number already exists
src/server/services/{projects.ts,tasks.ts,comments.ts,activity.ts,notifications.ts,search.ts}
src/server/services/task-actions.ts   # server actions for task mutations
src/app/(app)/org/[slug]/page.tsx     # dashboard: project list + activity feed
src/app/(app)/org/[slug]/projects/[key]/page.tsx  # board (kanban)
src/app/(app)/org/[slug]/tasks/[id]/page.tsx      # task detail
src/components/kanban/{Board.tsx,Column.tsx,TaskCard.tsx,TaskDialog.tsx}
src/components/{ActivityFeed.tsx,NotificationBell.tsx,SearchBox.tsx}
src/app/(app)/search/page.tsx
tests/integration/{projects.test.ts,tasks.test.ts,comments.test.ts,activity.test.ts,search.test.ts}
tests/unit/position.test.ts
```

---

### Task 1: Projects service + dashboard

**Files:** `projects.ts`, dashboard page, `tests/integration/projects.test.ts`

- [ ] Tests first: createProject (MEMBER can, outsider cannot; key auto-generated unique per org; nextNumber starts 1), renameProject (ADMIN+), archiveProject. RED.
- [ ] Implement: `createProject(orgId, actorId, name)` generates key from org slug + counter; migration adds `Project.nextNumber Int @default(1)`.
- [ ] Dashboard: project cards (name, key, task counts), new-project form, activity feed placeholder.
- [ ] Green + build. Commit `feat: projects + dashboard`.

### Task 2: Tasks CRUD + positions

**Files:** `tasks.ts`, `task-actions.ts`, `tests/unit/position.test.ts`, `tests/integration/tasks.test.ts`

- [ ] Unit tests first: position math — `positionBetween(a,b)` midpoints; rebalance triggers when gap < 0.01; ordering stable. RED.
- [ ] Integration tests: createTask (assignee must be org member; number = project.nextNumber, increments), updateTask fields, moveTask(boardId,status,position) cross-column, deleteTask. Outsider/other-org access → Forbidden. RED.
- [ ] Implement service + actions.
- [ ] Green. Commit `feat: task CRUD + position math`.

### Task 3: Kanban board UI (drag-drop)

**Files:** board page, `kanban/*` components

- [ ] Board page: columns BACKLOG→DONE, task cards (title, priority chip, assignee, due, labels).
- [ ] Client drag-drop: HTML5 draggable (no dnd lib); on drop compute midpoint, optimistic reorder, call moveTask action, revalidate.
- [ ] New-task dialog per column; card click → task detail page.
- [ ] Manual smoke via dev server + curl page 200s; unit position tests cover the math. Commit `feat: kanban board with drag-drop`.

### Task 4: Task detail + comments + mentions

**Files:** `comments.ts`, task detail page, `tests/integration/comments.test.ts`

- [ ] Tests first: addComment (member only, org-scoped task; @Name mention → Notification for matched members; comment on other-org task → Forbidden). RED.
- [ ] Implement + detail page: description edit, status/priority/assignee/due controls, comment list + form, per-task activity trail.
- [ ] Green. Commit `feat: task detail + comments + mentions`.

### Task 5: Activity feed + notifications

**Files:** `activity.ts`, `notifications.ts`, `ActivityFeed.tsx`, `NotificationBell.tsx`, tests

- [ ] Tests first: logActivity writes in mutation tx (task.created/updated/moved/deleted, comment.added, member.joined); notifications on assign/mention with correct recipients and no self-notification; markRead + unread count. RED.
- [ ] Wire logActivity into tasks/comments/members services (retrofit Plan 1 invitation accept).
- [ ] Dashboard feed (org-wide, newest 50); bell in layout with unread badge, mark-all-read.
- [ ] Green. Commit `feat: activity feed + notifications`.

### Task 6: Search

**Files:** `search.ts`, `SearchBox.tsx`, search page, `tests/integration/search.test.ts`

- [ ] Tests first: search(orgId, userId, q) returns tasks+projects matching ILIKE, only from caller's orgs (tenant isolation), empty q → empty, case-insensitive, ranks title matches first. RED.
- [ ] Implement + header search box → `/search?q=` results page grouped by type.
- [ ] Green. Commit `feat: org-scoped search`.

### Task 7: Seed + hardening

- [ ] Extend seed: 2 projects (ACME1, ACME2), 3 boards, ~15 tasks across statuses, comments, activity, one notification each user.
- [ ] Full suite + build; curl smoke: board page, task page, search page 200 with seeded session.
- [ ] README update (what's in Plan 2). Commit `feat: richer seed + plan-2 hardening`.

---

**Execution:** inline (executing-plans), continuous, TDD per task, ledger at `docs/superpowers/ledger-plan2.md`, final fresh-context review at end.
