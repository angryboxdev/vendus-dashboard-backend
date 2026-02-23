import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "../config/env.js";

let client: SupabaseClient | null = null;

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
