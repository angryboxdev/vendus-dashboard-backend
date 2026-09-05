import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The organization-listing unscoped door (spec C ticket 02). Both crons this
 * spec fans out (`process-direct-debits` over every organization,
 * `daily-vendus-consumption` over every organization/location pair — see
 * `organization-location-listing.ts`) need to enumerate organizations before
 * any single one is known, which is exactly what `ScopedQuery` can't do
 * (D7: it's only constructible from an already-known `OrganizationId`).
 * Nothing in this codebase lists organizations before this ticket.
 */
export interface OrganizationRow {
  organizationId: OrganizationId;
  name: string;
}

export async function listOrganizations(): Promise<OrganizationRow[]> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    organizationId: mintOrganizationId(row.id as string),
    name: row.name as string,
  }));
}
