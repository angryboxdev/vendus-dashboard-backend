/**
 * The shared kernel (D7, ADR-0008). This folder imports nothing from the
 * rest of `src/**` — enforced by the `kernel-e-puro` dependency-cruiser rule
 * — so it stays a single branded type rather than growing into a junk
 * drawer of "things every module needs".
 *
 * `OrganizationId` is a nominal string type: structurally it is a string,
 * but the type system only accepts one produced by `mintOrganizationId`.
 * That closes the specific hazard D7 names — threading the organization
 * into 54 ports that already take bare-string parameters (an employee id, a
 * date, a record id) makes a transposed argument a silent bug: it compiles,
 * runs, and returns nothing forever. A distinct type turns that transposition
 * into a compile error at the call site.
 *
 * `mintOrganizationId` is called in exactly two places by the end of B2's
 * foundation increment: the auth middleware, from the verified claim
 * (`src/middleware/auth.ts`), and the unattended scope
 * (`src/infra/scoped-db/unattended-scope.ts`).
 */

declare const ORGANIZATION_ID_BRAND: unique symbol;

export type OrganizationId = string & { readonly [ORGANIZATION_ID_BRAND]: true };

/**
 * The single mint function. The only way to produce an `OrganizationId` —
 * there is no other exported constructor, and the brand's symbol is not
 * exported, so nothing outside this module can fabricate one by casting.
 *
 * Throws on an empty/blank string rather than minting a value that would
 * silently filter every scoped query down to zero rows.
 */
export function mintOrganizationId(raw: string): OrganizationId {
  if (!raw || raw.trim().length === 0) {
    throw new Error("mintOrganizationId: organization id cannot be empty");
  }
  return raw as OrganizationId;
}
