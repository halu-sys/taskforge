# TaskForge

A complete project-management SaaS demo with a full subscription-billing subsystem.
Runs entirely locally: Next.js + PostgreSQL + Prisma. No external services.

**Built with AI agents under a review-gated workflow — see [CASE_STUDY.md](CASE_STUDY.md)
for the process, what the review agents caught, and the verification loop.**

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

## What's here (Plans 1-3 — complete)

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

**Plan 3 — Billing**
- Plan catalog (Free / Pro $10 / Business $20 per seat/mo) with enforced limits (members, projects, tasks) + upsell prompts
- Subscriptions: subscribe/switch (OWNER-only), cancel-at-period-end, resume, lazy expiry
- FakeProvider payment abstraction (card 4000000000000002 always declines) + atomic checkout (sub + PAID invoice + payment in one tx)
- Invoices: sequential INV-YYYY-#### numbers, list + detail pages, lines and payments
- Seats + integer proration (half-up, BigInt math): increase charges immediately, decrease applies next period
- Renewal + dunning: lazy renewal on billing read, PAST_DUE grace with UNCOLLECTED invoices, 3-strike cancel
- Seed: Acme on Pro (3 seats, 2 invoices) + Freddie's Shop on Free at project limit (upsell demo)

Demo logins: ada@taskforge.dev / taskforge-dev (Acme owner), freddie@taskforge.dev (same password).
