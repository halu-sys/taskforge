# Ledger — Plan 3 (Billing)

Plan: docs/superpowers/plans/2026-10-04-plan3-billing.md

- [x] T1 Plan catalog + entitlements
- [x] T2 Subscription core
- [x] T3 FakeProvider + checkout
- [x] T4 Invoices
- [x] T5 Seats + proration
- [x] T6 Renewal + dunning
- [x] T7 UI polish + seed + hardening

## Rulings & gotchas
- prorate() uses BigInt half-up (target < ES2020 bans 2n literals — use BigInt(2)).
- logActivity projectId param is string|undefined — pass undefined, not null.
- prisma migrate/generate fail while dev server runs (query_engine DLL locked) -> write migration.sql by hand + `prisma migrate deploy` per DB; generate may warn but client types still regenerate OK.
- prisma CLI loads .env even when DATABASE_URL is exported — for test-DB deploys, pass DATABASE_URL via subprocess env with .env absent, or unset in shell (tsx seed picked up stale exported test URL).
- renewSubscription runs lazily on billing page read (no cron); FakeProvider default card succeeds, 4000000000000002 declines.
- seats = paid quantity; members <= seats enforced in changeSeats only (invite limit is plan.maxMembers).
