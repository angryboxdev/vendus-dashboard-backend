# 20 — Promote the enforcement rule to an error; write the ADRs and update the architecture document

Status: ready-for-agent
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

- [ ] The dependency rule is `error` and the build passes
- [ ] Zero files outside the helper's folder import the Supabase client or package,
      except the provisioning job exempted by name
- [ ] `docs/adr/0008` exists and covers D1, D2, D7, D10
- [ ] `docs/adr/0009` exists and covers D3, D4, D5, D14, and states its own
      provisional status
- [ ] ADR-0007's Consequences section is amended, visibly, with what changed and why
- [ ] `docs/MULTI_TENANCY_SAAS_DESIGN.md` is updated in the four places listed
- [ ] The 406 → 371 correction is applied wherever the figure appears
