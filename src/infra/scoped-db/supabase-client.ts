import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "../../config/env.js";

/**
 * The raw Supabase client factory. Moved here from `src/infra/supabaseClient.ts`
 * (D6/D10/ADR-0008): this folder is the only place in `src/**` that may import
 * `@supabase/supabase-js`, enforced by the `supabase-so-no-scoped-db`
 * dependency-cruiser rule. Everything in this file is unchanged in behaviour
 * from the file it replaces — this is a relocation, not a rewrite.
 */

let client: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    return null;
  }
  if (!client) {
    client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);
}

/** Cliente com service role (ignora RLS). Usar só no servidor para módulo RH. */
export function getSupabaseServiceRole(): SupabaseClient | null {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  if (!serviceRoleClient) {
    serviceRoleClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceRoleClient;
}

export function isHrSupabaseConfigured(): boolean {
  return Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY);
}
