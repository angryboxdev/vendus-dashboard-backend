import type { SupabaseClient } from "@supabase/supabase-js";
import { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
import type { OrganizationIdentityPort } from "../../domain/ports/out/organization-identity.port.js";

function toEntity(row: Record<string, unknown>): OrganizationIdentity {
  return OrganizationIdentity.reconstitute({
    id: row.id as string,
    name: row.name as string,
    nif: row.nif as string,
    address: (row.address as string | null) ?? null,
    email: (row.email as string | null) ?? null,
  });
}

export class SupabaseOrganizationIdentityRepository implements OrganizationIdentityPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(orgId: string): Promise<OrganizationIdentity | null> {
    const { data, error } = await this.supabase
      .from("organizations")
      .select("id, name, nif, address, email")
      .eq("id", orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }
}
