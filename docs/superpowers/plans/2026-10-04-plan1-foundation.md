# TaskForge Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js app with full Prisma schema, email+password auth with sessions, organizations with roles, invitations, org switcher, and a green test harness — the base every later plan builds on.

**Architecture:** Next.js App Router + Server Actions; all writes go through `src/server/services/*` functions that enforce tenant isolation; Prisma against local Postgres (`taskforge` + `taskforge_test`).

**Tech Stack:** Next.js 15 (App Router, TS), Prisma 6, PostgreSQL 17 (winget), bcryptjs, zod, Vitest + supertest-free integration via direct service calls against test DB, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-04-taskforge-design.md`

## Global Constraints

- Money = integer cents everywhere. No floats for money.
- Every service mutation signature starts `(orgId, actorId, ...)` and verifies membership before any write.
- Sessions: httpOnly cookie `tf_session`, opaque token in `Session` table, 30-day expiry.
- Roles enum: `OWNER | ADMIN | MEMBER`. Only OWNER changes roles/removes OWNER; OWNER cannot remove self if last owner.
- Postgres: port 5432, roles `taskforge` (db `taskforge`) and `taskforge_test` (db `taskforge_test`), password `taskforge` / `taskforge_test`. DATABASE_URL in `.env`, TEST_DATABASE_URL in `.env.test`.
- Test command: `npm test` runs Vitest with `.env.test` loaded. Every task ends with green tests + a commit.
- UI: Tailwind, minimal hand-rolled components; no paid/external UI kit.

## File Structure (created across tasks)

```
package.json, tsconfig.json, next.config.ts, tailwind.config.ts, vitest.config.ts
prisma/schema.prisma            # full schema (all 3 plans) — migrated now, used later
prisma/seed.ts                  # demo data (grows in later plans)
src/app/                        # routes: (auth)/login, register; (app)/org/...; layout, globals.css
src/server/db.ts                # PrismaClient singleton (test-aware)
src/server/auth/{password.ts,session.ts,actions.ts}
src/server/services/{orgs.ts,invitations.ts,members.ts}
src/server/errors.ts            # AppError, PlanLimitError, ForbiddenError, NotFoundError
src/components/                 # forms, org switcher, layout chrome
tests/{unit/*.test.ts,integration/*.test.ts,helpers.ts}
scripts/setup-db.sh
```

---

### Task 1: Postgres install + scaffold + test harness

**Files:** `scripts/setup-db.sh`, `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.env`, `.env.test`, `.gitignore`

- [ ] Install Postgres 17: `winget install PostgreSQL.PostgreSQL.17` (silent; service auto-start). Verify `psql -U postgres` reachable (prompt for the installer-set password; store nothing in repo).
- [ ] Create roles/DBs via `scripts/setup-db.sh` (psql as postgres): roles `taskforge`/`taskforge_test`, DBs `taskforge`/`taskforge_test`, grants.
- [ ] Scaffold Next.js 15 + TS + Tailwind in repo root (`npx create-next-app@latest . --yes --ts --tailwind --app --no-eslint --src-dir --import-alias "@/*"`).
- [ ] Add deps: `prisma @prisma/client bcryptjs zod`; dev: `vitest @vitejs/plugin-react dotenv tsx`.
- [ ] Write `.env` / `.env.test` (DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET=dev-secret) + `.gitignore` entries.
- [ ] `vitest.config.ts` loads `.env.test`; write `tests/unit/smoke.test.ts` (asserts TEST_DATABASE_URL reachable via `prisma.$queryRaw\`SELECT 1\``).
- [ ] `npm test` → green. `npm run dev` → page loads. Commit: `chore: scaffold Next.js + Postgres + vitest harness`.

### Task 2: Full Prisma schema + migration

**Files:** `prisma/schema.prisma`, migration under `prisma/migrations/`

- [ ] Write full schema from spec §3: User, Session, Organization, Membership, Invitation, Project, Board, Task, Comment, ActivityEvent, Notification, Plan, Subscription, Invoice, InvoiceLine, Payment + enums (Role, TaskStatus, TaskPriority, SubStatus, InvoiceStatus, PaymentStatus, Interval). Unique constraints: `Membership(orgId,userId)`, `Invitation(token)`, `Session(token)`, `Subscription(orgId)` one-per-org, `Plan(slug)`. Indexes: Task(orgId,status), ActivityEvent(orgId,createdAt), Notification(userId,readAt).
- [ ] `prisma migrate dev --name init` against `taskforge`; `prisma migrate deploy` against `taskforge_test`.
- [ ] `src/server/db.ts` singleton honoring TEST_DATABASE_URL.
- [ ] Test `tests/unit/schema.test.ts`: create user+org+membership+task round-trip; unique constraint violation throws. Green. Commit: `feat: full prisma schema + migration`.

### Task 3: Password auth + sessions

**Files:** `src/server/errors.ts`, `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/actions.ts`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/login/page.tsx`, register/login form components, `src/middleware.ts`

- [ ] Unit tests first (`tests/unit/auth.test.ts`): hash/verify round-trip; session create→resolve→revoke; expired session rejected (fake timers). RED.
- [ ] Implement `password.ts` (bcryptjs, cost 10), `session.ts` (create/resolve/revoke, cookie helpers), `errors.ts`.
- [ ] Server actions `register(name,email,password)` (zod-validated, unique email, creates User + personal Organization + OWNER Membership + Free Subscription placeholder row deferred to Plan 3 — NOT here; org only) and `login/logout`. Redirect to `/org`.
- [ ] `middleware.ts`: unauthenticated → `/login` for `(app)` routes; authenticated hitting `(auth)` → `/org`.
- [ ] Minimal register/login pages with forms. Integration test `tests/integration/auth.test.ts`: register→session cookie→resolve; wrong password rejected; duplicate email rejected. Green. Commit: `feat: email+password auth with cookie sessions`.

### Task 4: Org service — memberships, roles, guards

**Files:** `src/server/services/orgs.ts`, `src/server/services/members.ts`, tests

- [ ] Integration tests first: `requireMembership(orgId,userId)` returns row or throws ForbiddenError; role matrix — OWNER can change roles/remove, ADMIN can manage MEMBER/ADMIN but not OWNER, MEMBER cannot; last-OWNER removal blocked. RED.
- [ ] Implement `orgs.ts` (createOrg with slug generation + uniqueness, renameOrg) and `members.ts` (listMembers, changeRole, removeMember) with the guard rules.
- [ ] Green. Commit: `feat: org memberships + role guards`.

### Task 5: Invitations

**Files:** `src/server/services/invitations.ts`, `src/app/(app)/org/members/page.tsx`, `src/app/invite/[token]/page.tsx`, tests

- [ ] Tests first: createInvitation (ADMIN+ only, unique pending email, 7-day expiry), acceptInvitation (valid token → Membership with invited role; expired → error; already member → idempotent), revokeInvitation. RED.
- [ ] Implement service. Members page: list + invite form (link shown in-page; "email" logged to server console) + pending list + revoke. `/invite/[token]` page: requires login, accept button → joins org.
- [ ] Green. Commit: `feat: token invitations with expiry + accept flow`.

### Task 6: App chrome — org switcher, members UI wiring, seed

**Files:** `src/app/(app)/layout.tsx`, `src/components/OrgSwitcher.tsx`, `src/app/(app)/org/page.tsx` (placeholder dashboard), `prisma/seed.ts`, `package.json` scripts

- [ ] `(app)` layout loads user + memberships; OrgSwitcher (dropdown, switch via cookie `tf_org`); org dashboard placeholder shows org name + members table (role controls for OWNER/ADMIN).
- [ ] `prisma/seed.ts`: users `ada@taskforge.dev`/`bob@…`/`carol@…` (password `taskforge-dev`), org `acme` (Ada OWNER, Bob ADMIN, Carol MEMBER), placeholder rows so later plans have context. `npm run seed` script; `npm run setup` = migrate+seed.
- [ ] Manual check: `npm run dev`, log in as Ada, switch orgs, invite email. Integration test: seeded data loads; Carol cannot change Bob's role. Green. Commit: `feat: app chrome, org switcher, seed data`.

### Task 7: Plan 1 hardening pass

**Files:** varies

- [ ] Run full suite; fix everything. `npm run dev` smoke: register new user → personal org → invite → accept in second browser context.
- [ ] Update README: setup instructions (winget command, setup-db.sh, npm run setup/dev/test).
- [ ] Commit: `docs: README + plan-1 hardening`.

---

**Execution:** inline (executing-plans), continuous, TDD per task, ledger at `docs/superpowers/ledger-plan1.md`.
