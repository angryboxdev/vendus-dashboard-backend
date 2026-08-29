import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import type { Pizza, PizzaCreateBody, PizzaUpdateBody, PizzaCategory } from "../domain/pizzaTypes.js";

type Row = {
  id: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function rowToPizza(row: Row): Pizza {
  const p: Pizza = {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    category: row.category as PizzaCategory,
    is_active: Boolean(row.is_active),
  };
  if (row.created_at !== undefined) p.created_at = row.created_at;
  if (row.updated_at !== undefined) p.updated_at = row.updated_at;
  return p;
}

const CATEGORIES: PizzaCategory[] = ["classics", "specials", "sweeties"];
export function validatePizzaCategory(c: string): c is PizzaCategory {
  return CATEGORIES.includes(c as PizzaCategory);
}

export async function listPizzas(
  organizationId: OrganizationId,
  filters?: { category?: PizzaCategory; is_active?: boolean }
): Promise<Pizza[]> {
  let q = createScopedQuery(organizationId)
    .table("pizzas")
    .select("id, name, description, category, is_active, created_at, updated_at")
    .order("name", { ascending: true });
  if (filters?.category) q = q.eq("category", filters.category);
  if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
  const { data, error } = await q;
  if (error) throw new Error(`Pizzas: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(rowToPizza);
}

export async function getPizza(organizationId: OrganizationId, id: string): Promise<Pizza | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("pizzas")
    .select("id, name, description, category, is_active, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToPizza(data as unknown as Row);
}

export async function createPizza(organizationId: OrganizationId, body: PizzaCreateBody): Promise<Pizza> {
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  if (!validatePizzaCategory(body.category)) throw new Error(`category inválida: ${body.category}`);
  const payload = {
    name,
    description: (body.description ?? "").trim(),
    category: body.category,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await createScopedQuery(organizationId)
    .table("pizzas")
    .insert(payload)
    .select("id, name, description, category, is_active, created_at, updated_at")
    .single();
  if (error) throw new Error(`Criar pizza: ${error.message}`);
  return rowToPizza(data as unknown as Row);
}

export async function updatePizza(
  organizationId: OrganizationId,
  id: string,
  body: PizzaUpdateBody
): Promise<Pizza> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = (body.name ?? "").trim();
  if (body.description !== undefined) updates.description = (body.description ?? "").trim();
  if (body.category !== undefined) {
    if (!validatePizzaCategory(body.category)) throw new Error(`category inválida: ${body.category}`);
    updates.category = body.category;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  const { data, error } = await createScopedQuery(organizationId)
    .table("pizzas")
    .update(updates)
    .eq("id", id)
    .select("id, name, description, category, is_active, created_at, updated_at")
    .single();
  if (error) throw new Error(`Atualizar pizza: ${error.message}`);
  if (!data) throw new Error("Pizza não encontrada");
  return rowToPizza(data as unknown as Row);
}

export async function deletePizza(organizationId: OrganizationId, id: string): Promise<void> {
  const { error } = await createScopedQuery(organizationId).table("pizzas").delete().eq("id", id);
  if (error) throw new Error(`Eliminar pizza: ${error.message}`);
}
