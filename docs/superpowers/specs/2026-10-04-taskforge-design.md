# TaskForge — Design Spec

**Status:** approved by user 2026-10-04
**Goal:** A complete, self-contained project-management SaaS demo with a full subscription-billing subsystem — every layer of a real SaaS exercised end-to-end, running locally.

## 1. Purpose & success criteria

Portfolio/demo piece. Success = a reviewer can run `npm run setup && npm run dev`, log in as a seeded user, drag tasks on a kanban board, invite a teammate, hit a plan limit, upgrade through a checkout flow, and see invoices and dunning behave correctly. No external services required.

## 2. Stack

- Next.js (App Router, TypeScript), Server Components for reads, Server Actions for mutations
- Prisma ORM + PostgreSQL (installed locally via winget; test DB separate)
- Tailwind CSS + hand-rolled shadcn-style components (no heavy UI kit dependency)
- Auth: email + password (bcrypt), httpOnly session cookies, self-contained (no OAuth providers)
- Payments: `PaymentProvider` interface + `FakeProvider` implementation. FakeProvider simulates a checkout page and fires webhook events through the *same* webhook handler a real Stripe integration would use. Swapping to Stripe = one new implementation.
- Testing: Vitest. Unit tests for services (billing math, limits, tenant isolation); integration tests for server actions against a test database.

## 3. Domain model

```
User ──< Membership >── Organization (roles: OWNER | ADMIN | MEMBER)
Organization ──< Project ──< Board ──< Task
Task: title, description, status (column), priority, position (float for drag-drop),
      assignee (User?), labels, dueDate?, createdBy, timestamps
Task ──< Comment
Organization ──< ActivityEvent (actor, verb, target polymorphic, payload JSON)
Organization ──< Invitation (email, token, role, expiresAt, acceptedAt?)
User ──< Notification (readAt?)
Organization ──< Subscription ── Plan
Plan: slug, name, priceCents, interval (month|year), maxMembers, maxProjects, maxTasksPerOrg, features JSON
Subscription: status (ACTIVE|TRIALING|PAST_DUE|CANCELED), currentPeriodEnd, cancelAtPeriodEnd,
              trialEndsAt?, paymentProviderId
Organization ──< Invoice (status DRAFT|OPEN|PAID|VOID|UNCOLLECTED) ──< InvoiceLine
Invoice ──< Payment (providerId, amount, status)
```

**Tenant isolation rule:** every service function takes `(orgId, userId, ...)` and verifies membership before touching data. No query path skips this. This is the single most-tested invariant in the codebase.

## 4. Feature set

### Auth & org
- Register / login / logout; session middleware; protected routes
- Org creation on signup; org switcher; org settings (name, slug)
- Members page: list, change role, remove; invitations via token link (email content mocked to console/inbox page)
- Roles: OWNER (billing + delete org), ADMIN (manage members + all CRUD), MEMBER (own work + assigned tasks)

### Core product
- Kanban board per project: columns by status, drag-and-drop (optimistic position updates), create/edit/delete task, labels, priority, assignee, due date
- Task detail: comments, activity trail
- Activity feed per org (filtered by project)
- Notifications (assigned, mentioned, invited) with unread badge
- Global search (tasks + projects, Postgres `ILIKE`/tsvector-lite)

### Billing
- Plans page with pricing; seeded Free/Pro/Team plans; Free plan exists as a real (zero-cost) subscription so enforcement is uniform
- Checkout: choose plan → fake provider checkout page → confirm → webhook → subscription ACTIVE
- Upgrade/downgrade with **proration** (unused-time credit computed in cents, integer math only)
- Cancel at period end; resume before period end
- Renewal job (`npm run jobs:renew`): extends period, creates invoice, charges via provider; failure → PAST_DUE + dunning (retry each run; after 3 failures → CANCELED, org downgraded to Free)
- Plan-limit enforcement at mutation time: maxMembers, maxProjects, maxTasksPerOrg → typed error `PlanLimitError` surfaced in UI with upgrade CTA
- Usage metering on dashboard (members/projects/tasks vs limits)
- Billing portal: subscription state, change plan, invoices list, invoice detail view, payment history

### Ops
- `npm run setup`: create DBs, migrate, seed (demo org, 3 users, 2 projects, boards, tasks, comments, one Pro subscription with invoice history)
- `npm run dev`, `npm test`, `npm run jobs:renew`

## 5. Non-goals

Real Stripe/email/SMS, OAuth, rate limiting, i18n, mobile app, real-time websockets (poll/refresh is fine), deployment infra. Everything runs on localhost.

## 6. Decomposition (each = own plan, own spec-to-plan cycle, working software at each boundary)

1. **Foundation:** Next.js scaffold, Postgres + Prisma schema (full schema up front, features later), auth, sessions, orgs/memberships/roles, invitations, org switcher, test harness + CI-style test script.
2. **Core product:** projects/boards/tasks/comments/activity/notifications/search + kanban UI.
3. **Billing:** plans/subscriptions/checkout/webhooks/invoices/proration/renewal job/dunning/limit enforcement/portal + Free-plan backfill for existing orgs.

## 7. Testing strategy

- Unit: proration math (integer cents, edge cases: mid-period, same-day, year interval), limit checks, role permission matrix, invitation token expiry.
- Integration: server actions against test DB — tenant isolation (user A cannot read/modify org B), full checkout→webhook→active flow, dunning sequence.
- Every plan task follows TDD: failing test → implement → pass → commit.

## 8. Risks

- Postgres install on Windows: pinned to winget PostgreSQL 17, port 5432, dedicated `taskforge`/`taskforge_test` roles.
- Drag-drop position math: float positions with periodic rebalance; tested in unit layer.
- Scope creep: anything not in §4 is out; new wants become follow-up specs.
