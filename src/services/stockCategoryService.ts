import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import type {
  StockCategory,
  StockCategoryCreateBody,
  StockCategoryUpdateBody,
} from "../domain/stockTypes.js";

type Row = { id: string; name: string };

function rowToCategory(row: Row): StockCategory {
  return { id: row.id, name: row.name ?? "" };
}

export async function listStockCategories(
  organizationId: OrganizationId
): Promise<StockCategory[]> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("stock_categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`Stock categories: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(rowToCategory);
}

export async function getStockCategory(
  organizationId: OrganizationId,
  id: string
): Promise<StockCategory | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("stock_categories")
    .select("id, name")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToCategory(data as unknown as Row);
}

export async function createStockCategory(
  organizationId: OrganizationId,
  body: StockCategoryCreateBody
): Promise<StockCategory> {
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  const { data, error } = await createScopedQuery(organizationId)
    .table("stock_categories")
    .insert({ name, updated_at: new Date().toISOString() })
    .select("id, name")
    .single();
  if (error) throw new Error(`Criar categoria: ${error.message}`);
  return rowToCategory(data as unknown as Row);
}

export async function updateStockCategory(
  organizationId: OrganizationId,
  id: string,
  body: StockCategoryUpdateBody
): Promise<StockCategory> {
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  const { data, error } = await createScopedQuery(organizationId)
    .table("stock_categories")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) throw new Error(`Atualizar categoria: ${error.message}`);
  if (!data) throw new Error("Categoria não encontrada");
  return rowToCategory(data as unknown as Row);
}

export async function deleteStockCategory(
  organizationId: OrganizationId,
  id: string
): Promise<void> {
  const { error } = await createScopedQuery(organizationId)
    .table("stock_categories")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Eliminar categoria: ${error.message}`);
}
