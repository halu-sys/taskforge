# Ledger — Plan 3 (Billing)

Plan: docs/superpowers/plans/2026-10-04-plan3-billing.md

- [x] T1 Plan catalog + entitlements
- [x] T2 Subscription core
- [x] T3 FakeProvider + checkout
- [x] T4 Invoices
- [x] T5 Seats + proration
- [x] T6 Renewal + dunning
- [x] T7 UI polish + seed + hardening

## Final review (whole-branch, fresh context)
- 1 BLOCKER + 7 MAJOR + 10 MINOR. All BLOCKER/MAJOR fixed in the follow-up commit:
  - BLOCKER: billing page ran expireIfNeeded/renewSubscription BEFORE membership check -> requireRole(MEMBER) first; renew/expire take actorId (null=system).
  - Renewal + checkout races: SELECT ... FOR UPDATE on the Subscription row inside the tx; concurrent test proves 1 charge / 1 strike.
  - Checkout idempotency: same-plan re-checkout rejected; upgrade charges; downgrade scheduled via pendingPlanId (applied at renewal).
  - Seat enforcement: member cap = min(plan.maxMembers, sub.seats).
  - Proration: real currentPeriodStart/End columns (migration), no synthetic 30/365 reconstruction.
  - Seed invoice numbers now consume the real Counter (no P2002 collision).
  - Payment method persisted (paymentToken); auto-renewal only from stored card; PAST_DUE retry requires explicit retryCard (OWNER action + banner button).
  - MINORs also fixed: atomic INSERT..RETURNING counter, addInterval day-clamp (billing/period.ts), subscribe() no longer resurrects PAST_DUE or clears dunning, actions catch AppError + revalidatePath layout, scripts/renew.ts added, PAST_DUE+cancelAtPeriodEnd handled.
- Deferred MINORs: TRIALING enum arm still unused (schema default only), charge-before-tx compensation shape (FakeProvider-safe), layout nav plan chip.
- New tests: billing-races.test.ts (outsider renewal blocked, concurrent checkout, concurrent renewal, seat cap, downgrade scheduling), re-checkout rejection. 111 green, build clean, seed re-run clean.

## Rulings & gotchas
- prorate() uses BigInt half-up (target < ES2020 bans 2n literals — use BigInt(2)).
- logActivity projectId param is string|undefined — pass undefined, not null.
- prisma migrate/generate fail while dev server runs (query_engine DLL locked) -> write migration.sql by hand + `prisma migrate deploy` per DB; generate may warn but client types still regenerate OK.
- prisma CLI loads .env even when DATABASE_URL is exported — for test-DB deploys, pass DATABASE_URL via subprocess env with .env absent, or unset in shell (tsx seed picked up stale exported test URL).
- renewSubscription runs lazily on billing page read (no cron); FakeProvider default card succeeds, 4000000000000002 declines.
- seats = paid quantity; members <= seats enforced in changeSeats only (invite limit is plan.maxMembers).
