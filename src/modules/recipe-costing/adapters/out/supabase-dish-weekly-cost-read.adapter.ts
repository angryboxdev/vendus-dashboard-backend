import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PreparationVersion, RecipeVersion } from "../../domain/entities/weekly-dish-cost.js";
import type { DishWeeklyCostReadPort } from "../../domain/ports/out/dish-weekly-cost-read.port.js";

interface VersionRow { entity_id: string; effective_from: string; payload: unknown }
interface PizzaPayload { lines?: { stock_item_id: string | null; preparation_id: string | null; size: string; quantity: number; waste_factor: number | null }[] }
interface PrepPayload { yield_qty?: number; use_as_unit?: boolean; items?: { stock_item_id: string; quantity: number }[] }

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Normaliza para ISO UTC («…Z»): o cálculo compara datas como texto. */
const iso = (s: string) => new Date(s).toISOString();

function toPizzaVersion(r: VersionRow): RecipeVersion {
  return {
    effectiveFrom: iso(r.effective_from),
    lines: ((r.payload as PizzaPayload).lines ?? []).map((l) => ({
      stockItemId: l.stock_item_id,
      preparationId: l.preparation_id,
      size: l.size,
      quantity: Number(l.quantity),
      wasteFactor: num(l.waste_factor),
    })),
  };
}

/** Lê `recipe_versions` (gravadas por triggers a cada alteração das fichas) e os artigos. */
export class SupabaseDishWeeklyCostReadAdapter implements DishWeeklyCostReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findPizza(organizationId: OrganizationId, pizzaId: string): Promise<{ id: string; name: string } | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("pizzas").select("id, name").eq("id", pizzaId).maybeSingle();
    if (error) throw new Error(`Custo semanal: ${error.message}`);
    return (data as unknown as { id: string; name: string } | null) ?? null;
  }

  async listPizzaVersions(organizationId: OrganizationId, pizzaId: string): Promise<RecipeVersion[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("recipe_versions")
      .select("entity_id, effective_from, payload")
      .eq("kind", "pizza")
      .eq("entity_id", pizzaId)
      .order("effective_from", { ascending: true });
    if (error) throw new Error(`Custo semanal: ${error.message}`);
    return ((data ?? []) as unknown as VersionRow[]).map(toPizzaVersion);
  }

  async listPizzas(organizationId: OrganizationId): Promise<{ id: string; name: string; category: string; isActive: boolean }[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("pizzas").select("id, name, category, is_active").order("name", { ascending: true });
    if (error) throw new Error(`Impacto nas pizzas: ${error.message}`);
    return ((data ?? []) as unknown as { id: string; name: string; category: string; is_active: boolean }[]).map((p) => ({ id: p.id, name: p.name, category: p.category, isActive: Boolean(p.is_active) }));
  }

  async listLatestPizzaVersions(organizationId: OrganizationId): Promise<Map<string, RecipeVersion>> {
    const out = new Map<string, RecipeVersion>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("recipe_versions")
        .select("entity_id, effective_from, payload")
        .eq("kind", "pizza")
        .order("effective_from", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Impacto nas pizzas: ${error.message}`);
      const rows = (data ?? []) as unknown as VersionRow[];
      for (const r of rows) out.set(r.entity_id, toPizzaVersion(r)); // ordem crescente: fica a mais recente
      if (rows.length < PAGE) return out;
    }
  }

  async listPreparationVersions(organizationId: OrganizationId, preparationIds: string[]): Promise<Map<string, PreparationVersion[]>> {
    const out = new Map<string, PreparationVersion[]>();
    if (preparationIds.length === 0) return out;
    const db = this.scopedQuery(organizationId);
    const [versions, names] = await Promise.all([
      db.table("recipe_versions").select("entity_id, effective_from, payload").eq("kind", "preparation").in("entity_id", preparationIds).order("effective_from", { ascending: true }),
      db.table("preparations").select("id, name").in("id", preparationIds),
    ]);
    if (versions.error) throw new Error(`Custo semanal: ${versions.error.message}`);
    if (names.error) throw new Error(`Custo semanal: ${names.error.message}`);
    const nameOf = new Map(((names.data ?? []) as unknown as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    for (const r of (versions.data ?? []) as unknown as VersionRow[]) {
      const p = r.payload as PrepPayload;
      const list = out.get(r.entity_id) ?? [];
      list.push({
        effectiveFrom: iso(r.effective_from),
        definition: {
          id: r.entity_id,
          name: nameOf.get(r.entity_id) ?? "",
          yieldQty: Number(p.yield_qty ?? 0),
          useAsUnit: Boolean(p.use_as_unit),
          items: (p.items ?? []).map((i) => ({ stockItemId: i.stock_item_id, quantity: Number(i.quantity) })),
        },
      });
      out.set(r.entity_id, list);
    }
    return out;
  }

  async listIngredients(organizationId: OrganizationId, stockItemIds: string[]) {
    const out = new Map<string, { name: string; baseUnit: string; manualCentsPerUnit: number | null }>();
    if (stockItemIds.length === 0) return out;
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_items")
      .select("id, name, base_unit, purchase_reference_unit_cost_without_vat")
      .in("id", stockItemIds);
    if (error) throw new Error(`Custo semanal: ${error.message}`);
    for (const r of (data ?? []) as unknown as { id: string; name: string; base_unit: string; purchase_reference_unit_cost_without_vat: number | null }[]) {
      // O catálogo guarda o custo manual em € por unidade base; o cálculo trabalha em cêntimos.
      const manual = num(r.purchase_reference_unit_cost_without_vat);
      out.set(r.id, { name: r.name, baseUnit: r.base_unit, manualCentsPerUnit: manual === null ? null : manual * 100 });
    }
    return out;
  }
}
