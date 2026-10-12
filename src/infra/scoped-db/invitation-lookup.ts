import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The invitation-code unscoped door (FE-054, ADR-0035). Exactly one place in
 * `src/**` queries `invitations` by code hash with no organization filter —
 * a worker asking to join has no session, so the organization is only known
 * once the code is resolved. Consumed only by the invitations module's
 * lookup adapter. Returns only the organization and invitation ids; the
 * caller re-reads the invitation through the scoped query (state, expiry).
 *
 * "Missing" returns null; a genuine database error throws (never folded
 * into "missing"), like `findLocationTokenScopeByHash`.
 */
export interface InvitationScopeRow {
  organizationId: OrganizationId;
  invitationId: string;
}

export async function findInvitationScopeByCodeHash(codeHash: string): Promise<InvitationScopeRow | null> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  const { data, error } = await supabase.from("invitations").select("id, org_id").eq("code_hash", codeHash).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { organizationId: mintOrganizationId(row.org_id as string), invitationId: row.id as string };
}
