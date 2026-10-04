# Case Study: Building a SaaS with AI Agents — Process, Not Just Code

This repo was built with autonomous AI coding agents (Hermes Agent + a
superpowers-style workflow). The point of this document is not the app — it's
**how the work was orchestrated, verified, and kept honest.** Every number and
finding below is pulled from the actual git history and the review ledgers in
`docs/superpowers/`.

## The build in one paragraph

TaskForge is a multi-tenant project-management SaaS (Next.js 16, Prisma,
PostgreSQL) with a full subscription-billing subsystem: plan limits,
seats/proration, invoices, renewal, dunning. It was built in one session across
**3 plans / 21 tasks**, TDD-gated, with an **independent review agent auditing
each plan before the next one started**. Final state: 34 commits, ~4,100 lines
of TypeScript, **111 passing tests**, clean production build.

## The workflow

```
spec → plan (per phase) → per-task: write test → implement → green → commit
                                    ↓
                     plan complete → fresh-context review agent
                                    ↓
                     findings triaged: BLOCKER / MAJOR / MINOR
                                    ↓
              all BLOCKER+MAJOR fixed in a dedicated commit; MINORs
              explicitly accepted or deferred with reasons in the ledger
```

Key orchestration decisions:

1. **Phased plans with hard gates.** Foundation (auth/tenancy) → core product
   (boards/tasks) → billing. No phase started until the previous one was green
   and reviewed. The billing phase therefore inherited a tested tenancy layer
   instead of inventing its own.
2. **Review by a fresh agent, not the builder.** After each plan, a separate
   agent with no memory of the build conversation audited the whole branch.
   Builder and reviewer are different contexts — the reviewer has no reason to
   defend the code and finds what the builder rationalized.
3. **Ledgers as the audit trail.** `docs/superpowers/ledger-plan{1,2,3}.md`
   record every task, every "ruling" (deviation from plan + why), and every
   review finding with its disposition. Nothing was silently fixed or silently
   skipped.
4. **Findings became tests.** The race-condition fixes shipped with
   concurrency tests (e.g. two simultaneous renewals → exactly one charge,
   one dunning strike) so the bug class stays dead.

## What the review agents actually caught

Across 3 review rounds: **1 BLOCKER, 25 MAJOR, 24 MINOR** findings. All
BLOCKER/MAJOR fixed; MINORs accepted/deferred with written reasons.

The findings that matter:

- **BLOCKER (Plan 3): tenant-isolation violation in billing.** The billing
  page ran lazy renewal/re-charging *before* checking that the requesting
  user was a member of the org — an outsider could trigger subscription
  state changes. Caught by the reviewer reading the page top-to-bottom;
  fixed by ordering `requireRole` first and threading `actorId` through
  every billing service.
- **Double-charge races (Plan 3):** checkout and renewal had
  check-then-act windows. Fix: `SELECT ... FOR UPDATE` on the subscription
  row inside the transaction, proven by a concurrent-request test.
- **Seat-limit loophole (Plan 3):** member caps read the plan limit but not
  the paid seat count — 1 paid seat allowed 25 members. Money-correctness
  bug, not just a feature bug.
- **10 concurrency/consistency MAJORs (Plan 2):** task-number collisions
  under parallel creates (fixed with CAS + retry), kanban rebalance outside
  the move transaction, optimistic drag with no rollback, unescaped LIKE
  wildcards in search.
- **Plan 1:** last-OWNER-demotion lockout, org-switch action writing the
  tenant cookie before validating membership.

None of these are "the app doesn't render" bugs. They're the subtle
concurrency/security class that AI-generated code reliably contains unless
something actively hunts for it. That's the operator's job: **the verification
loop, not the typing.**

## What I'd point at in an interview

- `src/server/services/subscriptions.ts` — renewal state machine + dunning
- `tests/integration/billing-races.test.ts` — the concurrency proofs
- `docs/superpowers/` — the plans, ledgers, and review dispositions
- `git log` — the pattern: `feat(task)` → `fix: review findings` → `docs: ledger`

## Honest limitations

- Payments are a deterministic `FakeProvider` (interface mirrors Stripe;
  swapping is the intended extension point). No webhooks, no trials wired.
- Single-node demo: no rate limiting, no email delivery (invite links are
  logged), middleware is cookie-presence-only with page-level authority.
- Built in one focused session; the review depth is per-plan, not continuous.

The limitations are listed here because an operator's credibility rests on
knowing what the system *doesn't* do, not just what it does.
