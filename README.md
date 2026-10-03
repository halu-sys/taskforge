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

## What's here (Plan 1 — Foundation)

- Email+password auth, httpOnly cookie sessions, route middleware
- Organizations with OWNER/ADMIN/MEMBER roles and enforced permission matrix
- Token invitations (7-day expiry, revoke, accept flow)
- Org switcher, members management UI, seeded demo org
- Full Prisma schema for all three plans (product + billing tables already migrated)

Plans 2 (boards/tasks/comments/activity/search) and 3 (billing: checkout, invoices,
proration, dunning, plan limits) build on this foundation. See
`docs/superpowers/specs/` and `docs/superpowers/plans/`.
