import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * Porta não-scoped da demonstração do Stock (independente da do RH, que não é tocada). Dois casos que o
 * ScopedQuery não cobre: (1) a partir da organização FICTÍCIA encontrar a sua ligação, que pertence à empresa
 * real; (2) criar a organização fictícia (`is_demo = true`, `demo_of = null` — a ligação vive em
 * `stock_demo_organizations`). Nunca lista nem altera outras organizações.
 */
function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

export interface StockDemoRow {
  org_id: string;
  scenario: string;
  demo_org_id: string;
  seed: number;
  monthly_sales_target_cents: number | string;
  pos_name: string;
  pos_api_key_hint: string;
  created_at: string;
}

export const STOCK_DEMO_COLUMNS = "org_id, scenario, demo_org_id, seed, monthly_sales_target_cents, pos_name, pos_api_key_hint, created_at";

/** Ligação de uma organização fictícia do Stock; `null` se a organização não for uma demo do Stock. */
export async function findStockDemoByDemoOrg(demoOrg: OrganizationId): Promise<StockDemoRow | null> {
  const { data, error } = await client().from("stock_demo_organizations").select(STOCK_DEMO_COLUMNS).eq("demo_org_id", demoOrg).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StockDemoRow | null) ?? null;
}

/** Cria a organização fictícia de um cenário (só `is_demo = true`, nunca ligada pelo `demo_of` do RH). */
export async function createStockDemoOrganization(input: { name: string; nif: string; timezone: string | null }): Promise<OrganizationId> {
  const { data, error } = await client()
    .from("organizations")
    .insert({ name: input.name, nif: input.nif, is_demo: true, ...(input.timezone && { timezone: input.timezone }) })
    .select("id")
    .single();
  if (error) throw new Error(`Criar organização de demonstração do Stock: ${error.message}`);
  return mintOrganizationId(String((data as { id: string }).id));
}
