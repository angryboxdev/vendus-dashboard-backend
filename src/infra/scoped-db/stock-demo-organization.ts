import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * Porta não-scoped da demonstração do Stock (independente da do RH, que não é tocada). Dois casos que o
 * ScopedQuery não cobre: (1) a partir da organização FICTÍCIA encontrar a sua ligação, que pertence à empresa
 * real; (2) criar a organização fictícia; (3) listar as organizações fictícias, para os crons as excluírem.
 *
 * As organizações fictícias do Stock são `is_demo = false` (a regra `organizations_demo_consistency_ck` liga
 * `is_demo` a `demo_of`, que é único por empresa e pertence à demo do RH — não se altera), `status = 'inactive'`
 * e identificadas por `stock_demo_organizations`. Nunca altera outras organizações.
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

/** Cria a organização fictícia de um cenário (inativa, sem `demo_of`; a ligação fica em `stock_demo_organizations`). */
export async function createStockDemoOrganization(input: { name: string; nif: string; timezone: string | null }): Promise<OrganizationId> {
  const { data, error } = await client()
    .from("organizations")
    .insert({ name: input.name, nif: input.nif, is_demo: false, status: "inactive", ...(input.timezone && { timezone: input.timezone }) })
    .select("id")
    .single();
  if (error) throw new Error(`Criar organização de demonstração do Stock: ${error.message}`);
  return mintOrganizationId(String((data as { id: string }).id));
}

/** Ids das organizações fictícias do Stock (para os crons as excluírem). */
export async function listStockDemoOrganizationIds(): Promise<Set<string>> {
  const { data, error } = await client().from("stock_demo_organizations").select("demo_org_id");
  // Antes da migração 20261130100000 a tabela não existe: sem demos do Stock, os crons seguem iguais.
  if (error) {
    if (/does not exist|42P01|schema cache/i.test(`${error.code ?? ""} ${error.message}`)) return new Set();
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as { demo_org_id: string }[]).map((r) => r.demo_org_id));
}

/** Nome e fuso da empresa real (para dar nome à organização fictícia). */
export async function realOrganizationInfo(org: OrganizationId): Promise<{ name: string; timezone: string | null } | null> {
  const { data, error } = await client().from("organizations").select("name, timezone").eq("id", org).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as { name: string; timezone: string | null };
  return { name: String(r.name), timezone: r.timezone ?? null };
}
