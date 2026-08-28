import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The unscoped door (D5/D10, ADR-0008). Exactly one place in `src/**`
 * constructs an `org_members` query with no organization filter — because no
 * organization is known yet. Every legitimate unscoped need in the codebase
 * is built on this single primitive rather than each writing its own raw
 * query, so there is exactly one named unscoped function, not a general
 * unscoped query surface:
 *
 * - the auth middleware (`src/middleware/auth.ts`), resolving which
 *   organization a token belongs to, applying D5's "exactly one membership,
 *   or refuse" rule on top of this function's result;
 * - user administration's account-deletion check
 *   (`src/routes/authRoutes.ts`), which must know whether a person belongs
 *   to *any* organization at all before deleting their auth account —
 *   inherently a cross-organization question, since deleting the account
 *   revokes access everywhere, not just in the caller's organization.
 *
 * Adding a third consumer, or a second raw query, means editing this file
 * and naming what is being done — a reviewable act, not an ergonomic escape
 * hatch sitting next to the scoped one.
 */

export interface MembershipRow {
  organizationId: string;
  role: string;
}

export async function listMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return [];

  const { data, error } = await supabase.from("org_members").select("org_id, role").eq("user_id", userId);
  if (error || !data) return [];

  return data.map((row) => ({
    organizationId: (row as { org_id: string }).org_id,
    role: (row as { role: string }).role,
  }));
}
