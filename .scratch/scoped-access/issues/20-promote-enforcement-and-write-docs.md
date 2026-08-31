# 20 — Promote the enforcement rule to an error; write the ADRs and update the architecture document

Status: done
Blocked by: 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18
Spec: `../spec.md` (D10, D18, D19), ADR-0007

## Problem

The enforcement rule has been a warning since ticket 01, because it reported
hundreds of violations on the day it was added. Once every area is converted the
count is zero, and a rule that stays a warning after that point is decoration —
ADR-0007's whole argument is that the deferral of RLS is cheap **only if** the
helper is the sole construction site, and a warning does not keep it so.

The written record is also now partly wrong. ADR-0007's three stated criteria
were written before this spec's design existed, and two of them have been
superseded.

## Work

1. **Promote the dependency rule from `warn` to `error`.** This is only possible
   at zero violations; if any remain, the ticket that owns them is not finished.
2. **Verify the count honestly.** No file in `src/**` imports the Supabase client
   or package except the helper's folder and the provisioning job exempted by
   name. Record the number of remaining violations as zero in the ticket comments,
   with the command used.
3. **Write ADR-0008 — the scoped query helper.** D1 (auto-scoping wrapper over a
   typed registry), D2 (explicit port parameter), D7 (branded type), D10 (sole
   construction site, enforced by an import rule). Include why the
   explicit-filter-plus-lint alternative was rejected: the 91 multi-statement
   query chains, and the untyped client that removes the usual counter-argument.
4. **Write ADR-0009 — location is a caller-supplied write input, not an isolation
   boundary.** D3, D4, D5, D14. Say plainly that it is provisional and names the
   two specs expected to revisit it.
5. **Amend ADR-0007's Consequences.** The decision stands; its criteria do not.
   Criterion 2 (searching for query syntax) is demoted to a secondary check by the
   import rule. Criterion 3 (continuous integration) is answered by the build gate
   (D18), with a pull-request workflow recorded as an additive follow-up. Do not
   silently rewrite history — mark it as an amendment and say what changed.
6. **Update `docs/MULTI_TENANCY_SAAS_DESIGN.md`:** the status header; §2.6's claim
   about the dependency lint, which B1 already flagged as wrong; §5.1's row for
   this spec; and the deferred register's reasoning for composite foreign keys per
   D16 — the current wording gives the wrong reason.
7. **Record the corrected call-site count.** ADR-0007 and B1 both cite 406; the
   real figure is 371, because a plain search for `.from(` also matches
   `Array.from` and `Buffer.from`. Correct it where it appears rather than leaving
   a discrepancy for a future reader to chase.

## Not in scope

No code conversion. If this ticket finds an unconverted call site, it belongs to
the ticket that owns that area, not here.

## Notes

- CLAUDE.md's rule is that a decision that is architectural — hard to reverse,
  surprising to a future reader, or the product of a real trade-off — goes to
  `docs/adr/` rather than a module README. Both of these qualify on all three
  counts.
- Keep the two ADRs separate. The helper is close to permanent; the location
  decision is explicitly provisional. Bundled, a later spec would supersede an ADR
  that is half still true — which is how ADRs rot.
- Module READMEs were updated inside their own tickets. This ticket does not
  revisit them.

## Done when

- [x] The dependency rule is `error` and the build passes
- [x] Zero files outside the helper's folder import the Supabase client or package,
      except the provisioning job exempted by name
- [x] `docs/adr/0008` exists and covers D1, D2, D7, D10
- [x] `docs/adr/0009` exists and covers D3, D4, D5, D14, and states its own
      provisional status
- [x] ADR-0007's Consequences section is amended, visibly, with what changed and why
- [x] `docs/MULTI_TENANCY_SAAS_DESIGN.md` is updated in the four places listed
- [x] The 406 → 371 correction is applied wherever the figure appears

## Ticket comments

**Re-verified from scratch on retry**, after confirming ticket 18 (HR
conversion) is merged: `main` is at `cc08880` (merge of PR #21, which merges
commit `3c17205 "18"`). `Blocked by` list (04–18) is fully merged into `main`.

**Zero-violations verification, honest source (dependency-cruiser, not
grep).** Command, run before touching severity:

```
npx depcruise src --config .dependency-cruiser.cjs
```

Output:

```
✔ no dependency violations found (677 modules, 2502 dependencies cruised)
```

Corroborated with an import-based (not `.from(`-text-based) secondary check —
who imports the Supabase client/package, and who imports the helper's own
client factory, outside `src/infra/scoped-db`:

```
grep -rln "@supabase/supabase-js" src/         # only src/infra/scoped-db/* + 3 README.md mentions
grep -rln "supabase-client" src/ | grep -v "src/infra/scoped-db"   # only src/jobs/runOrganizationProvisioning.ts
```

Both come back exactly as D10 predicts: the helper's own folder, plus the
provisioning job exempted by name. **Zero violations, confirmed genuinely,
not by a `.from(` grep** (which would false-match `Array.from`/`Buffer.from`
per the ticket's own warning).

**Promoted `.dependency-cruiser.cjs`'s `supabase-so-no-scoped-db` rule from
`warn` to `error`.** Re-ran the same command after the edit:

```
npx depcruise src --config .dependency-cruiser.cjs
✔ no dependency violations found (677 modules, 2502 dependencies cruised)
```
Exit code 0, clean at `error` severity.

**Typecheck, build and lint:deps all pass** with the rule at `error`:
- `npm run typecheck` → clean, no output, exit 0
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, exit 0
- `npm run lint:deps` → clean, exit 0

**Full test suite**: 144/145 suites pass (1261/1262 tests). One pre-existing
failure, unrelated to this ticket and not caused by this change — confirmed
by stashing the `.dependency-cruiser.cjs` edit and re-running against
unmodified `main`, which fails identically:
`src/modules/payable-entries/__tests__/use-cases/get-payable-summary.test.ts`
uses `new Date()` against a hardcoded `2026-07-*` fixture, so
`paidThisMonth` only matches when the real clock reads July 2026. Not fixed
here — out of scope (docs + config only; ticket forbids fixing call sites,
and this isn't even a call-site issue).

**Confirmed criterion 3's real state before writing ADR-0007's amendment**
(per instructions): `build` is `tsc -p tsconfig.build.json` only, `start` is
`node dist/server.js` — neither calls `npm run check`. No `.github/workflows`
directory exists. This matches ticket 01's comments exactly (the `build`
wiring was reverted after a broken deploy: `npm ci` under
`NODE_ENV=production` omits the `jest`/`jest-util` devDependencies `npm run
check` needs). Enforcement today is `.claude/hooks/run-checks.mjs`
(PostToolUse, widened to the whole tree in ticket 01, fires only on an
agent's edit under `src/modules/<module>/`) plus manual `npm run check`. ADR-0007's amendment describes exactly this, not the more optimistic "CI" framing.

**Files created:**
- `docs/adr/0008-scoped-query-helper-is-the-sole-construction-site.md` — D1, D2, D7, D10; the rejected explicit-filter-plus-lint alternative (91 multi-statement chains, untyped client).
- `docs/adr/0009-location-is-a-caller-supplied-write-input.md` — D3, D4, D5, D14; states its provisional status and names the two specs expected to revisit it (device-identity spec; the location-as-read-filter feature).

**Files changed:**
- `.dependency-cruiser.cjs` — `supabase-so-no-scoped-db` severity `warn` → `error`; comment updated to drop the now-stale "ships at warn" framing.
- `docs/adr/0007-app-level-scoping-is-the-tenant-boundary.md` — 406→371 fixed in place (2 occurrences, incl. 192→182 to match B2's own breakdown); added a visible `## Amendment (spec B2, ticket 20)` section covering criteria 1/2 (subsumed by ADR-0008's import rule) and criterion 3 (honest state, not CI — see above). Original Consequences text left intact.
- `docs/MULTI_TENANCY_SAAS_DESIGN.md` — the 4 named places: status header (dated 2026-08-31, matching this doc's existing dating convention), §2.6 point 1 (dependency-lint claim corrected to the import-rule mechanism and its real, non-CI enforcement path), §5.1's B2 row (marked implemented, increment 21 named as remaining), and the deferred-register paragraph's composite-foreign-key reasoning (D16: "every write endpoint accepting an identifier is an unvalidated cross-tenant reference," not "divergence is impossible").
- `.scratch/tenant-identity/spec.md` and `.scratch/tenant-identity/issues/05-organization-provisioning-script.md` — 406→371 fixed in place (targeted: only the headline count, not B1's own "192" sub-count, which the ticket didn't flag as wrong).

**Not changed:** `.scratch/scoped-access/spec.md`'s own "A correction to the counts in circulation" section already states 371 correctly (it's the source of the correction) — left as-is. `src/infra/scoped-db/table-registry.ts`'s comment already narrates the 406→371 correction historically — left as-is. Stale `.claude/worktrees/17-*` and `.claude/worktrees/18-*` copies still contain "406" — these are leftover git worktrees from already-merged branches, not part of the working tree this ticket edits, and were left untouched.
