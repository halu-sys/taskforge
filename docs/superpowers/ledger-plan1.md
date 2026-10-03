# Ledger — Plan 1 (Foundation)

Plan: docs/superpowers/plans/2026-10-04-plan1-foundation.md
Mode: inline, continuous.

## Tasks
- [x] T1 Postgres + scaffold + vitest harness (77e8fa8)
- [x] T2 Full Prisma schema + migration (5a76a09)
- [x] T3 Auth + sessions (d46eb69)
- [x] T4 Org memberships + role guards (e9d4736)
- [x] T5 Invitations (a13daf1)
- [x] T6 App chrome + org switcher + seed (b370ef8)
- [x] T7 Hardening + README (ac887c2)

## Rulings
- Ruling: smoke test checks TCP reachability instead of Prisma query — PrismaClient can't be constructed before a schema exists (T1 precedes T2) — schema.test.ts covers real queries.
- Ruling: prisma pinned to v6 (npm default resolved 8.0.0-rc) — plan says Prisma 6, RC unstable.
- Ruling: "use server" files may only export async functions; cookie-name constants moved to src/server/cookies.ts — Next 16 hard rule.
- Ruling: register creates personal org but NO Free subscription row — deferred to Plan 3 per plan; Plan 3 must backfill.
- Ruling: invitation email = console.log of invite link (demo stand-in per spec §4).

## Notes for Plan 2/3
- middleware.ts deprecated in Next 16 (warning only; "proxy" is successor).
- tf_org cookie written but unused; pages resolve org by slug.
- scripts/mksess.mjs = dev-only session minting for curl smoke tests.
- Secret-masking in agent tool calls corrupts literal passwords in commands; build URLs from vars or read .env in scripts.
