/**
 * Orchestration for the organization-provisioning script (ticket 05,
 * spec.md D7). Deliberately NOT a `src/modules/` hexagonal module: this is a
 * one-shot operational script that runs outside the request path, not a
 * feature the running application exposes. See `src/jobs/runOrganizationProvisioning.ts`
 * for the CLI entry point and the org-#2 gate this script prints.
 *
 * One call to `provisionOrganization` creates, in order:
 *   1. the `organizations` row
 *   2. its first `locations` row
 *   3. the first auth user
 *   4. that user's `admin` membership in `org_members`
 *
 * Every dependency is injected as a plain async function so this file can be
 * unit-tested with fakes and never touches Supabase directly (mirrors the
 * constructor-injection style of `src/modules/tasks/application/use-cases`,
 * even though this isn't a use case class).
 *
 * Rollback: a failure after the organization row exists must not leave an
 * orphaned row blocking retry (`nif` is unique, so a second attempt can't
 * just re-insert the org). Each step that fails rolls back everything
 * created by the steps before it, in reverse order, then rethrows the
 * original error. A duplicate `nif` is the one failure that needs no
 * rollback at all: it is caught on the very first insert, before anything
 * else has been created.
 */

export class DuplicateOrganizationNifError extends Error {
  constructor(public readonly nif: string) {
    super(`An organization with nif "${nif}" already exists.`);
    this.name = "DuplicateOrganizationNifError";
  }
}

export type ProvisionOrganizationInput = {
  orgName: string;
  orgNif: string;
  orgAddress?: string;
  orgEmail?: string;
  locationName: string;
  locationCode: string;
  /** Defaults to 'Europe/Lisbon' (same default as the `locations` table). */
  locationTimezone?: string;
  adminEmail: string;
  adminPassword: string;
};

export type ProvisionedOrganization = {
  id: string;
  name: string;
  nif: string;
};

export type ProvisionedLocation = {
  id: string;
  orgId: string;
  name: string;
  code: string;
};

export type ProvisionedAdminUser = {
  id: string;
  email: string;
};

export type ProvisionedMembership = {
  orgId: string;
  userId: string;
  role: "admin";
};

export type ProvisionOrganizationResult = {
  organization: ProvisionedOrganization;
  location: ProvisionedLocation;
  adminUser: ProvisionedAdminUser;
  membership: ProvisionedMembership;
};

/**
 * Every step the orchestration needs, as injectable functions. Implementations
 * live in `runOrganizationProvisioning.ts` (real Supabase calls); tests use
 * in-memory fakes.
 *
 * `createOrganization` must throw `DuplicateOrganizationNifError` when the
 * `nif` unique constraint is violated — that's the signal the orchestration
 * uses to bail out before creating anything else.
 */
export type ProvisionOrganizationDeps = {
  createOrganization(input: {
    name: string;
    nif: string;
    address: string | undefined;
    email: string | undefined;
  }): Promise<ProvisionedOrganization>;

  createLocation(input: {
    orgId: string;
    name: string;
    code: string;
    timezone: string;
  }): Promise<ProvisionedLocation>;

  createAdminAuthUser(input: {
    email: string;
    password: string;
  }): Promise<ProvisionedAdminUser>;

  createMembership(input: {
    orgId: string;
    userId: string;
  }): Promise<ProvisionedMembership>;

  /** Best-effort rollback. Failures here are logged by the caller, never thrown. */
  deleteOrganization(orgId: string): Promise<void>;
  /** Best-effort rollback. Failures here are logged by the caller, never thrown. */
  deleteLocation(locationId: string): Promise<void>;
  /** Best-effort rollback. Failures here are logged by the caller, never thrown. */
  deleteAuthUser(userId: string): Promise<void>;

  /** Optional hook for observing rollback failures (defaults to a no-op). */
  onRollbackError?(step: string, error: unknown): void;
};

const DEFAULT_LOCATION_TIMEZONE = "Europe/Lisbon";

/**
 * Creates an organization, its first location, its first admin auth user
 * and that user's `admin` membership — in that order, rolling back everything
 * created so far if a later step fails.
 *
 * Calls `createMembership` at most once, and only after every prior step has
 * succeeded, so a run can never produce more than the one membership row it's
 * supposed to (D5: two memberships locks a user out of both organizations).
 */
export async function provisionOrganization(
  input: ProvisionOrganizationInput,
  deps: ProvisionOrganizationDeps,
): Promise<ProvisionOrganizationResult> {
  const onRollbackError =
    deps.onRollbackError ??
    ((step: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Rollback step "${step}" failed: ${message}`);
    });

  // Step 1: organization. A duplicate nif fails here, before anything else
  // exists, so there is nothing to roll back — just propagate.
  const organization = await deps.createOrganization({
    name: input.orgName,
    nif: input.orgNif,
    address: input.orgAddress,
    email: input.orgEmail,
  });

  // Step 2: first location.
  let location: ProvisionedLocation;
  try {
    location = await deps.createLocation({
      orgId: organization.id,
      name: input.locationName,
      code: input.locationCode,
      timezone: input.locationTimezone?.trim() || DEFAULT_LOCATION_TIMEZONE,
    });
  } catch (err) {
    await safely(() => deps.deleteOrganization(organization.id), "deleteOrganization", onRollbackError);
    throw err;
  }

  // Step 3: first auth user.
  let adminUser: ProvisionedAdminUser;
  try {
    adminUser = await deps.createAdminAuthUser({
      email: input.adminEmail,
      password: input.adminPassword,
    });
  } catch (err) {
    await safely(() => deps.deleteLocation(location.id), "deleteLocation", onRollbackError);
    await safely(() => deps.deleteOrganization(organization.id), "deleteOrganization", onRollbackError);
    throw err;
  }

  // Step 4: exactly one admin membership.
  let membership: ProvisionedMembership;
  try {
    membership = await deps.createMembership({
      orgId: organization.id,
      userId: adminUser.id,
    });
  } catch (err) {
    await safely(() => deps.deleteAuthUser(adminUser.id), "deleteAuthUser", onRollbackError);
    await safely(() => deps.deleteLocation(location.id), "deleteLocation", onRollbackError);
    await safely(() => deps.deleteOrganization(organization.id), "deleteOrganization", onRollbackError);
    throw err;
  }

  return { organization, location, adminUser, membership };
}

async function safely(
  fn: () => Promise<void>,
  step: string,
  onError: (step: string, error: unknown) => void,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    onError(step, err);
  }
}
