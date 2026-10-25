import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  DishDefinition,
  IngredientCost,
  PreparationDefinition,
  RecipeCostingSnapshot,
  RecipeLine,
} from "../../domain/entities/recipe-costing.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";

interface PizzaRow { id: string; name: string; category: string; is_active: boolean }
interface PriceRow { pizza_id: string; size: string; price: number }
interface RecipeRow { id: string; pizza_id: string }
interface RecipeItemRow {
  recipe_id: string;
  stock_item_id: string | null;
  preparation_id: string | null;
  size: string;
  quantity: number;
  waste_factor: number | null;
}
interface PreparationRow { id: string; name: string; yield_qty: number; use_as_unit: boolean }
interface PreparationItemRow { preparation_id: string; stock_item_id: string; quantity: number }
interface StockItemRow { id: string; name: string; base_unit: string; purchase_reference_unit_cost_without_vat: number | null }
interface LastPurchaseRow { item_id: string; last_purchase_without_vat: number | null }

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Lê diretamente as tabelas legacy (`pizzas`, `pizza_prices`, `pizza_recipes`,
 * `pizza_recipe_items`, `preparations`, `preparation_items`, `stock_items`) e o
 * último custo de compra pela RPC `get_stock_quantities_with_last_purchase` —
 * a mesma que o catálogo de stock usa, para o custo ser igual nos dois ecrãs.
 */
export class SupabaseRecipeCostingReadAdapter implements RecipeCostingReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async loadSnapshot(organizationId: OrganizationId): Promise<RecipeCostingSnapshot> {
    const db = this.scopedQuery(organizationId);
    const [pizzas, prices, recipes, preparations, preparationItems] = await Promise.all([
      db.table("pizzas").select("id, name, category, is_active").order("name", { ascending: true }),
      db.table("pizza_prices").select("pizza_id, size, price"),
      db.table("pizza_recipes").select("id, pizza_id").eq("is_active", true),
      db.table("preparations").select("id, name, yield_qty, use_as_unit"),
      db.table("preparation_items").select("preparation_id, stock_item_id, quantity"),
    ]);
    for (const r of [pizzas, prices, recipes, preparations, preparationItems]) {
      if (r.error) throw new Error(`Custo das fichas técnicas: ${r.error.message}`);
    }

    const recipeRows = (recipes.data ?? []) as unknown as RecipeRow[];
    let itemRows: RecipeItemRow[] = [];
    if (recipeRows.length > 0) {
      const { data, error } = await db
        .table("pizza_recipe_items")
        .select("recipe_id, stock_item_id, preparation_id, size, quantity, waste_factor")
        .in("recipe_id", recipeRows.map((r) => r.id));
      if (error) throw new Error(`Custo das fichas técnicas: ${error.message}`);
      itemRows = (data ?? []) as unknown as RecipeItemRow[];
    }

    const preparationDefs: PreparationDefinition[] = ((preparations.data ?? []) as unknown as PreparationRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      yieldQty: Number(p.yield_qty),
      useAsUnit: Boolean(p.use_as_unit),
      items: ((preparationItems.data ?? []) as unknown as PreparationItemRow[])
        .filter((pi) => pi.preparation_id === p.id)
        .map((pi) => ({ stockItemId: pi.stock_item_id, quantity: Number(pi.quantity) })),
    }));

    const linesByRecipe = new Map<string, RecipeLine[]>();
    for (const row of itemRows) {
      const list = linesByRecipe.get(row.recipe_id) ?? [];
      list.push({
        stockItemId: row.stock_item_id,
        preparationId: row.preparation_id,
        size: row.size,
        quantity: Number(row.quantity),
        wasteFactor: num(row.waste_factor),
      });
      linesByRecipe.set(row.recipe_id, list);
    }
    const activeRecipeByPizza = new Map(recipeRows.map((r) => [r.pizza_id, r.id]));
    const priceRows = (prices.data ?? []) as unknown as PriceRow[];

    const dishes: DishDefinition[] = ((pizzas.data ?? []) as unknown as PizzaRow[]).map((p) => {
      const recipeId = activeRecipeByPizza.get(p.id);
      return {
        pizzaId: p.id,
        name: p.name,
        category: p.category,
        isActive: Boolean(p.is_active),
        prices: priceRows.filter((pr) => pr.pizza_id === p.id).map((pr) => ({ size: pr.size, price: Number(pr.price) })),
        lines: recipeId ? (linesByRecipe.get(recipeId) ?? []) : null,
      };
    });

    const itemIds = new Set<string>();
    for (const row of itemRows) if (row.stock_item_id) itemIds.add(row.stock_item_id);
    for (const p of preparationDefs) for (const pi of p.items) itemIds.add(pi.stockItemId);

    return { dishes, preparations: preparationDefs, ingredients: await this.loadCosts(organizationId, [...itemIds]) };
  }

  private async loadCosts(organizationId: OrganizationId, itemIds: string[]): Promise<IngredientCost[]> {
    if (itemIds.length === 0) return [];
    const db = this.scopedQuery(organizationId);
    const [items, lastPurchases] = await Promise.all([
      db.table("stock_items").select("id, name, base_unit, purchase_reference_unit_cost_without_vat").in("id", itemIds),
      db.getStockQuantitiesWithLastPurchase(itemIds),
    ]);
    if (items.error) throw new Error(`Custo das fichas técnicas: ${items.error.message}`);
    if (lastPurchases.error) throw new Error(`Custo das fichas técnicas: ${lastPurchases.error.message}`);

    const lastByItem = new Map(
      ((lastPurchases.data ?? []) as unknown as LastPurchaseRow[]).map((r) => [r.item_id, num(r.last_purchase_without_vat)]),
    );
    return ((items.data ?? []) as unknown as StockItemRow[]).map((row) => {
      // Mesma precedência do catálogo (`stockItemService.effectiveLastPurchaseCosts`): a fatura manda.
      const fromInvoice = lastByItem.get(row.id) ?? null;
      const manual = num(row.purchase_reference_unit_cost_without_vat);
      const source = fromInvoice != null ? "invoice" : manual != null ? "manual" : null;
      return {
        stockItemId: row.id,
        name: row.name,
        baseUnit: row.base_unit,
        unitCostWithoutVat: fromInvoice ?? manual,
        source,
      };
    });
  }
}
