import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The device-token unscoped door (spec E D5/D7). Exactly one place in
 * `src/**` queries `location_tokens` by hash with no organization filter —
 * a device token's whole purpose is proving which organization and
 * location it belongs to, so the organization isn't known until this
 * lookup returns. Consumed only by `requireDeviceAuth`'s wiring
 * (`src/middleware/device-auth.ts`). A revoked token is simply a row that
 * no longer exists (D4/Solution section) — this returns null for it with
 * no distinguishing signal from "never existed" (story 35).
 *
 * That collapse is deliberate only between "missing" and "revoked" — a
 * genuine Supabase/DB error (timeout, connection blip) is a third, distinct
 * outcome and is never folded into it: this throws instead of returning
 * null, so `requireDeviceAuth` can tell "token rejected" apart from "lookup
 * itself failed" and answer the two differently.
 */
export interface DeviceTokenScopeRow {
  organizationId: string;
  locationId: string;
}

export async function findLocationTokenScopeByHash(tokenHash: string): Promise<DeviceTokenScopeRow | null> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    console.error("[device-auth] token lookup failed: Supabase service role não configurado");
    throw new Error("Supabase service role não configurado");
  }

  const { data, error } = await supabase
    .from("location_tokens")
    .select("org_id, location_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  
  if (error) {
    console.error(`[device-auth] token lookup failed: ${error.message}`);
    throw new Error(error.message);
  }

  if (!data) {
    console.warn("[device-auth] token lookup didn't find any data")
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    organizationId: row.org_id as string,
    locationId: row.location_id as string,
  };
}
