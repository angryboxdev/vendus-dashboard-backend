import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * Porta não-scoped da organização de demonstração do Novo RH (ADR-0034):
 * criar uma organização ainda não é possível com o ScopedQuery (que exige
 * uma organização conhecida). Só cria organizações `is_demo = true`
 * ligadas a uma organização real; nunca lista nem altera outras.
 */
function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

export async function organizationInfo(org: OrganizationId): Promise<{ name: string; isDemo: boolean; timezone: string | null } | null> {
  const { data, error } = await client().from("organizations").select("name, is_demo, timezone").eq("id", org).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return { name: String(r.name), isDemo: r.is_demo === true, timezone: r.timezone ? String(r.timezone) : null };
}

export async function findDemoOrganization(realOrg: OrganizationId): Promise<{ id: OrganizationId; name: string } | null> {
  const { data, error } = await client().from("organizations").select("id, name").eq("demo_of", realOrg).eq("is_demo", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return { id: mintOrganizationId(String(r.id)), name: String(r.name) };
}

export async function createDemoOrganization(realOrg: OrganizationId, input: { name: string; nif: string; timezone: string | null }): Promise<{ id: OrganizationId; name: string }> {
  const { data, error } = await client()
    .from("organizations")
    .insert({ name: input.name, nif: input.nif, is_demo: true, demo_of: realOrg, ...(input.timezone && { timezone: input.timezone }) })
    .select("id, name")
    .single();
  if (error) throw new Error(`Criar organização de demonstração: ${error.message}`);
  const r = data as Record<string, unknown>;
  return { id: mintOrganizationId(String(r.id)), name: String(r.name) };
}
