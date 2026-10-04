# Ledger — Plan 2 (Core Product)

Plan: docs/superpowers/plans/2026-10-04-plan2-core-product.md
Mode: inline, continuous.

## Tasks
- [x] T1 Projects service + dashboard
- [x] T2 Tasks CRUD + positions
- [x] T3 Kanban board UI (drag-drop)
- [x] T4 Task detail + comments + mentions
- [x] T5 Activity feed + notifications
- [x] T6 Search
- [x] T7 Seed + hardening

## Rulings
- Ruling: cross-org project/task access throws NotFoundError (not ForbiddenError) — existence of other-org resources is not disclosed — tests assert /not found/i.
- Ruling: MEMBER may mutate tasks they created OR are assigned to (spec "own work + assigned tasks"); ADMIN+ all — implemented in assertCanMutate.
- Ruling: inline "use server" in client components is rejected by Next 16 build; all actions live in "use server" modules and are bound via .bind(null, ...) — applies to every form.
- Ruling: comment activity logs projectId undefined (Comment has no direct project link; taskId in payload suffices for demo feed) — cheap to backfill later.
- Ruling: search box uses plain GET form (method=get) not a server action — search is read-only, no mutation needed.
- Ruling: seed deletes org first (cascade) then users; dev server must be restarted after schema migrations or it serves a stale Prisma client (500 on archivedAt) — recurring gotcha.

## Final review (whole-branch, fresh context)
- 0 BLOCKER, 10 MAJOR (all concurrency/consistency, tenant isolation clean), 7 MINOR.
- Fixed in ef6e45f: CAS task numbering (single tx + retry), rebalance inside move tx (capped 500), optimistic drag rollback, revalidatePath for /projects/[key], P2002 key-race retry, project+board atomic create, search LIKE-wildcard escaping, mention exact-token matching, org-scoped status lookup in updateTaskFieldAction, enum validation.
- Deferred MINORs (acceptable for demo): positions.ts helpers still client-duplicated, notify() unused, activity projectId filter, feed limit clamp, blanket catch in 2 more pages.
- 4 new tests (concurrent numbering, rebalance path, task.moved activity, enum rejection). 66 green, build clean.
