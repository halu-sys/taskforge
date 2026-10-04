# TaskForge

A complete project-management SaaS demo with a full subscription-billing subsystem.
Runs entirely locally: Next.js + PostgreSQL + Prisma. No external services.

## Prerequisites

- Node 20+
- PostgreSQL 17 (`winget install PostgreSQL.PostgreSQL.17`)
- Create roles/databases once: `bash scripts/setup-db.sh`
  (prompts nothing; uses postgres superuser password `postgres` — override with `PGPASSWORD=... bash scripts/setup-db.sh`)

## Setup

```
npm install
cp .env.example .env        # then set your real passwords if you changed them
cp .env.example .env.test   # test DB
npm run setup               # migrate + seed
npm run dev                 # http://localhost:3000
```

Demo login: `ada@taskforge.dev` / `taskforge-dev` (also bob@ / carol@, same password).

## Commands

| command | what |
|---|---|
| `npm run dev` | dev server |
| `npm test` | vitest suite (unit + integration against `taskforge_test`) |
| `npm run setup` | migrate + seed |
| `npm run seed` | seed demo data only |

## What's here (Plans 1-2)

**Plan 1 — Foundation**
- Email+password auth, httpOnly cookie sessions, route middleware
- Organizations with OWNER/ADMIN/MEMBER roles and enforced permission matrix
- Token invitations (7-day expiry, revoke, accept flow)
- Org switcher, members management UI

**Plan 2 — Core product**
- Projects (auto keys, archive) + dashboard with activity feed
- Kanban board: 5 columns, drag-and-drop with float positions + auto-rebalance
- Task detail: status/priority/assignee controls, comments with @mention notifications
- Org activity feed (task/comment/member events) + notification bell with unread badge
- Org-scoped search (tasks + projects, case-insensitive)
- Rich seed: 2 projects, 10 tasks, comments, activity, notifications

Plan 3 (billing: checkout, invoices, proration, dunning, plan limits) builds on this. See
`docs/superpowers/specs/` and `docs/superpowers/plans/`.
