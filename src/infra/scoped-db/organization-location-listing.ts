import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The (org, location) pair listing unscoped door (spec C ticket 02).
 * `daily-vendus-consumption` fans out over every organization/location pair
 * that exists, before it knows which of them has Vendus configured for that
 * location — that lookup (`vendus_credentials`/`vendus_location_config`)
 * happens per pair afterwards, scoped, once the pair's organization is
 * known.
 */
export interface OrgLocationPairRow {
  organizationId: OrganizationId;
  locationId: string;
}

export async function listOrganizationLocationPairs(): Promise<OrgLocationPairRow[]> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");

  const { data, error } = await supabase
    .from("locations")
    .select("org_id, id")
    .order("org_id", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    organizationId: mintOrganizationId(row.org_id as string),
    locationId: row.id as string,
  }));
}
