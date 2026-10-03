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
- Final review (fresh-context subagent): 0 BLOCKER, 8 MAJOR, 7 MINOR. All MAJORs fixed in 2e73b15 + digest fix commit: last-OWNER demotion guard, switchOrgAction validates slug+membership before cookie write, TEST_DATABASE_URL honored in db.ts, setup-db.sh stray-brace fixed, .env.example complete, /org no-membership loop -> auto-create personal org, invitation email zod-validated + expired-pending handling + revoke NotFound + list filters expired.
- Accepted MINORs (deferred): cookie `secure` flag (local demo), middleware cookie-presence-only auth (page-level currentSession is authority), invite `?next=` param dead (wire in Plan 2), mksess.mjs prod guard (demo-only tool), member-actions z.enum at action boundary (privilege logic already sound).
- middleware.ts deprecated in Next 16 (warning only; "proxy" is successor).
- tf_org cookie now validated at write time; still unused for reads — Plan 2 may use it for default landing.
- scripts/mksess.mjs = dev-only session minting for curl smoke tests.
- Secret-masking in agent tool calls corrupts literal passwords in commands; build URLs from vars or read .env in scripts.
