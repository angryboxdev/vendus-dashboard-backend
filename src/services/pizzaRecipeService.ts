import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import type { PizzaRecipe, PizzaRecipeCreateBody, PizzaRecipeUpdateBody } from "../domain/pizzaTypes.js";

type Row = {
  id: string;
  pizza_id: string;
  version: number;
  is_active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

function rowToRecipe(row: Row): PizzaRecipe {
  const r: PizzaRecipe = {
    id: row.id,
    pizza_id: row.pizza_id,
    version: Number(row.version),
    is_active: Boolean(row.is_active),
    notes: row.notes ?? null,
  };
  if (row.created_at !== undefined) r.created_at = row.created_at;
  if (row.updated_at !== undefined) r.updated_at = row.updated_at;
  return r;
}

export async function listPizzaRecipes(organizationId: OrganizationId, pizzaId: string): Promise<PizzaRecipe[]> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("pizza_recipes")
    .select("id, pizza_id, version, is_active, notes, created_at, updated_at")
    .eq("pizza_id", pizzaId)
    .order("version", { ascending: true });
  if (error) throw new Error(`Pizza recipes: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(rowToRecipe);
}

export async function getPizzaRecipe(organizationId: OrganizationId, id: string): Promise<PizzaRecipe | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("pizza_recipes")
    .select("id, pizza_id, version, is_active, notes, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToRecipe(data as unknown as Row);
}

export async function createPizzaRecipe(
  organizationId: OrganizationId,
  body: PizzaRecipeCreateBody
): Promise<PizzaRecipe> {
  if (!body.pizza_id) throw new Error("pizza_id é obrigatório");
  const version = Number(body.version) || 1;
  const is_active = body.is_active !== false;
  const payload = {
    pizza_id: body.pizza_id,
    version,
    is_active,
    notes: (body.notes ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  const scoped = createScopedQuery(organizationId);
  if (is_active) {
    await scoped
      .table("pizza_recipes")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("pizza_id", body.pizza_id);
  }
  const { data, error } = await scoped
    .table("pizza_recipes")
    .insert(payload)
    .select("id, pizza_id, version, is_active, notes, created_at, updated_at")
    .single();
  if (error) throw new Error(`Criar receita: ${error.message}`);
  return rowToRecipe(data as unknown as Row);
}

export async function updatePizzaRecipe(
  organizationId: OrganizationId,
  id: string,
  body: PizzaRecipeUpdateBody
): Promise<PizzaRecipe> {
  const scoped = createScopedQuery(organizationId);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.version !== undefined) updates.version = Number(body.version);
  if (body.notes !== undefined) updates.notes = (body.notes ?? "").trim() || null;
  if (body.is_active !== undefined) {
    updates.is_active = body.is_active;
    if (body.is_active === true) {
      const { data } = await scoped.table("pizza_recipes").select("pizza_id").eq("id", id).single();
      const recipe = data as unknown as { pizza_id: string } | null;
      if (recipe?.pizza_id) {
        await scoped
          .table("pizza_recipes")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("pizza_id", recipe.pizza_id)
          .neq("id", id);
      }
    }
  }
  const { data, error } = await scoped
    .table("pizza_recipes")
    .update(updates)
    .eq("id", id)
    .select("id, pizza_id, version, is_active, notes, created_at, updated_at")
    .single();
  if (error) throw new Error(`Atualizar receita: ${error.message}`);
  if (!data) throw new Error("Receita não encontrada");
  return rowToRecipe(data as unknown as Row);
}

export async function setActivePizzaRecipe(
  organizationId: OrganizationId,
  pizzaId: string,
  recipeId: string
): Promise<PizzaRecipe> {
  const scoped = createScopedQuery(organizationId);
  await scoped
    .table("pizza_recipes")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("pizza_id", pizzaId);
  const { data, error } = await scoped
    .table("pizza_recipes")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", recipeId)
    .eq("pizza_id", pizzaId)
    .select("id, pizza_id, version, is_active, notes, created_at, updated_at")
    .single();
  if (error) throw new Error(`Ativar receita: ${error.message}`);
  if (!data) throw new Error("Receita não encontrada");
  return rowToRecipe(data as unknown as Row);
}

export async function deletePizzaRecipe(organizationId: OrganizationId, id: string): Promise<void> {
  const { error } = await createScopedQuery(organizationId).table("pizza_recipes").delete().eq("id", id);
  if (error) throw new Error(`Eliminar receita: ${error.message}`);
}
