# 01 — Foundation: branded organization type, scoped query helper, enforcement, locations endpoint

Status: done
Blocked by: —
Spec: `../spec.md` (D1, D2, D5 partial, D6, D7, D10, D11, D15, D18), ADR-0007

## Problem

371 query construction sites build queries directly against a Supabase client and
none of them mentions an organization. Nothing can be converted until the thing
they convert *to* exists — and nothing stops the count growing again until the
rule that forbids them is running.

This ticket builds the whole floor: the type, the helper, the registry, the one
named unscoped function, the enforcement rule, the check script, and the first
endpoint that proves the path works end to end.

## Work

1. **The branded organization type**, in a new shared kernel folder, with a
   single mint function. The folder imports nothing from the rest of the source
   tree; add a dependency rule saying so, so it does not become a junk drawer.
   The mint is called in exactly two places by the end of this spec: the auth
   middleware and the unattended scope (item 4).

2. **The table registry.** One entry per table queried anywhere in the codebase —
   58 distinct tables, all named by string literals, so this types cleanly.
   Each entry records which column carries the organization (defaulting to the
   usual one, with `organizations` keyed on its own primary key) and whether the
   table is location-bearing. A table absent from the registry must be a
   **compile error** at the call site, not a runtime failure.

3. **The scoped query helper.** Constructible only from an organization. Its
   table facade returns the **native** PostgREST builder from each verb, with the
   organization already applied, so everything downstream — ordering, ranges,
   counts, further filters, single-row modifiers — keeps working untouched and a
   converted call site differs by one identifier.
   - select: filtered
   - insert / upsert: stamped
   - update / delete: filtered, composing with any later identifier filter rather
     than being replaced by it

4. **The unattended scope**, in one named file: the organization and location used
   by every path with no authenticated user. It is passed as an ordinary argument
   like any other caller's. Add a comment naming spec C as the thing that deletes
   it, so the trigger is visible from the file itself.

5. **The unscoped door.** Exactly one named function — the auth middleware's
   membership lookup, which reads a user's membership when no organization is yet
   known. **No general unscoped query surface**: it must not be possible to
   express an arbitrary unscoped query without editing this folder and naming what
   is being done.

6. **Move the remaining infrastructure surfaces into the same folder**, because
   item 7 requires it: the object-storage access (8 sites, invoices and payable
   recurrences) behind a named wrapper with **no organization parameter and no
   path prefixing**, and the auth-admin user operations (`authRoutes`, 6 sites)
   behind named wrappers. User administration's own queries move onto the helper
   at the same time — they are already organization-filtered by hand, so this is a
   simplification, not a behaviour change.

7. **The enforcement rule**, as a dependency-cruiser rule: the helper's folder is
   the only place in `src/**` that may import the Supabase client or the Supabase
   package. Ships at **`warn`** — it will report hundreds of violations today.
   Exempt the organization provisioning job **by name**, not by folder, with a
   comment citing B1's D7. The other two jobs are not exempt.

8. **The check script**, running the type check, the test suite and the
   dependency rules; wire it into the build command so a violation fails the
   deploy. Widen the agent hook's dependency-rule scope from a single module
   directory to the whole source tree.

9. **The locations endpoint.** A new organization-scoped read listing the caller's
   organization's locations. This is the spec's smallest end-to-end proof — a new
   read travelling request → verified claim → use case → helper → database.

10. **Unit tests on the helper** (see Done when).

## Not in scope

No existing adapter or service is converted. No column default is dropped. No
composite key is added. The rule is a warning, not an error — promoting it is
ticket 20.

## Notes

- The helper is the **only new seam** this spec introduces. Resist adding a
  second; every other guarantee is verified through the enforcement rule or the
  existing use case tests.
- The organization is applied by intercepting only the *first* verb and returning
  the native builder. If you find yourself re-implementing the builder's chaining
  methods, the design has gone wrong.
- Do not add an organization parameter to the storage wrapper "for later". An
  argument that is deliberately ignored is worse than one that is absent — see
  D17.
- The registry's entries are reused twice more: as the fixture list for the
  helper's tests, and as the table-and-key list the eventual RLS policies are
  written from. Keep it readable as data.

## Done when

- [x] The organization type cannot be produced from a bare string except through
      the mint function
- [x] The helper cannot be constructed without an organization
- [x] A select through the helper carries the organization filter
- [x] An update carries it, and composes with a later filter on an identifier
      rather than replacing it
- [x] A delete carries it
- [x] An insert body is stamped with it
- [x] A table whose organization key is its own primary key is filtered on that key
- [x] A table absent from the registry does not compile
- [x] Exactly one named unscoped function exists, and no general unscoped query
      surface exists
- [x] The Supabase client is imported only inside the helper's folder, plus the
      provisioning job exempted by name
- [x] `npm run check` runs the type check, tests and dependency rules, and the
      build command runs it
- [x] The agent hook runs the dependency rules over the whole source tree
- [x] The locations endpoint returns the caller's organization's locations, and is
      built through the helper
- [x] The existing suite still passes and the deploy still succeeds
