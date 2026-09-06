import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The pairing-code unscoped door (spec E D6). Exactly one place in `src/**`
 * queries `pairing_codes` by its code value with no organization filter —
 * because redeeming a code is exactly how an unpaired screen learns which
 * organization and location it belongs to; the organization isn't known
 * until this lookup returns. Consumed only by
 * `SupabasePairingCodeRepository.findByCode` (writes to this table always
 * know the organization already, so they go through `ScopedQuery` as
 * normal — this door is read-only and query-by-code-only).
 */
export interface PairingCodeRow {
  id: string;
  orgId: string;
  locationId: string;
  code: string;
  expiresAt: string;
  burnedAt: string | null;
  createdAt: string;
  description: string | null;
}

export async function findPairingCodeRowByCode(code: string): Promise<PairingCodeRow | null> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("pairing_codes")
    .select("id, org_id, location_id, code, expires_at, burned_at, created_at, description")
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    locationId: row.location_id as string,
    code: row.code as string,
    expiresAt: row.expires_at as string,
    burnedAt: (row.burned_at as string | null) ?? null,
    createdAt: row.created_at as string,
    description: (row.description as string | null) ?? null,
  };
}
