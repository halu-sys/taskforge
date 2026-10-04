# Plan 3 — Billing (TaskForge)

Spec: docs/superpowers/specs/2026-10-04-taskforge-design.md
Depends on: Plans 1-2 complete (66 tests green).

## Global constraints (inherited)
- All writes through src/server/services/*; requireMembership/requireRole first; cross-org ids → NotFoundError.
- Mutations in a single prisma.$transaction when multi-table.
- TDD: write failing test first per task. `npm test` must stay green.
- Money is integer cents everywhere. Dates are Date objects; no floating money math.
- FakeProvider is deterministic and injectable; no network calls.

## Tasks

### T1 — Plan catalog + seed + entitlements helper
- Seed 3 plans: free (0, 3 members, 3 projects, 100 tasks), pro (1000/seat/mo, 25/25/5000), business (2000/seat/mo, 999/999/99999).
- `entitlements.ts`: `getLimits(orgId)` → plan limits via subscription (no subscription = free plan).
- `assertWithinLimit(orgId, "projects"|"members"|"tasks", currentCount)` → throws `LimitError` (new AppError code `limit`).
- Enforce in createProject, inviteMember, createTask. Tests: over-limit blocked per tier; upgrade raises limit.

### T2 — Subscription core
- `subscriptions.ts`: `getSubscription(orgId)`, `startTrialOrSubscribe(orgId, actorId, planSlug)` (OWNER only), `setCancelAtPeriodEnd(bool)`, `resume()`.
- New org → free plan implicitly (no Subscription row). Subscribe = create/update Subscription ACTIVE, currentPeriodEnd = now+interval.
- Status transitions: TRIALING→ACTIVE, ACTIVE→CANCELED at period end (function `expireIfNeeded(orgId)` called on read — lazy cron).
- Tests: OWNER-only, idempotent subscribe, cancel-at-period-end semantics, lazy expiry downgrades to free limits.

### T3 — FakeProvider + checkout
- `billing/provider.ts`: interface `PaymentProvider { createCheckout(amountCents, meta): {checkoutId}; charge(checkoutId): Promise<{ok, providerId, failReason?}> }`. `FakeProvider` with scripted outcomes (env/arg-controlled success; card number "4000000000000002" always fails).
- Checkout page `/org/[slug]/billing/checkout?plan=pro`: plan summary + fake card form → server action → provider.charge → on success create Subscription + first Invoice (PAID, lines) in one tx; on failure show error, no subscription.
- Tests: success path creates sub+invoice atomically; failure path creates neither; invoice number unique (INV-YYYY-#### via counter).

### T4 — Invoices
- `invoices.ts`: `listInvoices(orgId)`, `getInvoice(orgId, id)` (org-scoped), invoice creation helper used by T3/T5/T6 (number sequence, lines, PAID + Payment row).
- Billing page: current plan card, seat count, invoices table, invoice detail page with lines + payment status.
- Tests: numbering sequence, org isolation, detail access OWNER/ADMIN/MEMBER read-only.

### T5 — Seats + proration
- Seat count = memberships count. `changeSeats(orgId, actorId, newCount)` on ACTIVE sub:
  - increase: prorated charge for remaining period (round half-up, integer math: amountCents * remainingMs / totalMs), invoice OPEN→PAID via provider, period unchanged.
  - decrease: no refund mid-period; new lower seat count applies next period (store `pendingSeats` in Subscription via payload? NO — add `seats Int` column + migration; effective immediately for limits, proration credit only on next invoice).
- Limit check: adding a member beyond paid seats requires seat change (inviteMember uses max(seats, plan.maxMembers)? NO — seats = paid quantity; members ≤ seats).
- Tests: proration math exact (30-day period, add seat at day 10 → 20/30 charge), decrease takes effect next invoice, integer rounding.

### T6 — Renewal + dunning
- `renewSubscriptions(orgId)`: called lazily on billing-page read + exposed as `scripts/renew.ts` for manual runs. If currentPeriodEnd passed: charge provider for next period amount (seats × price).
  - success → new Invoice PAID, period extended, dunningFailures=0.
  - failure → status PAST_DUE, dunningFailures++, invoice UNCOLLECTED; after 3 failures → CANCELED + org falls to free limits.
- Billing page banner for PAST_DUE with "Retry payment" action.
- Tests: renewal success/failure, 3-strike cancel, retry action, limits enforced while PAST_DUE grace (limits stay until CANCELED).

### T7 — Billing UI polish + seed + hardening
- /org/[slug]/billing page: plan card (name, price, seats, period end, cancel/resume buttons), plan comparison table, upgrade/downgrade buttons (downgrade = at period end), PAST_DUE banner, invoices list.
- Upsell prompt when LimitError surfaces in UI (project create, invite).
- Seed: Acme on pro (3 seats, 2 invoices), new seeded org "Freddie's" on free near limits for demo.
- Full `npm run build` + `npm test` green; live curl smoke of billing pages.

## Definition of done
- All 7 tasks committed with tests; final whole-branch review (fresh context) with findings addressed; README updated; ledger docs/superpowers/ledger-plan3.md kept current.
