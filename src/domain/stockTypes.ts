/** Tipo de item de stock */
export type StockItemType =
  | "ingredient"
  | "beverage"
  | "packaging"
  | "cleaning"
  | "other";

/** Unidade base para quantidade */
export type StockBaseUnit = "g" | "kg" | "ml" | "l" | "un" | "cl";

/**
 * Preços / custos de um item de stock (abstração):
 *
 * 1) **Venda (opcional)** — `is_sellable` + `sale_price` quando o item é vendável ao público.
 *
 * 2) **Custo de catálogo (opcional)** — por `base_unit`, independentes:
 *    `purchase_reference_unit_cost_with_vat`, `purchase_reference_unit_cost_without_vat`.
 *
 * 3) **Último custo de compra (só leitura)** — da última movimentação `purchase` (por
 *    `movement_date`, depois `created_at`) com pelo menos um dos custos preenchido;
 *    `last_purchase_unit_cost_with_vat` / `last_purchase_unit_cost_without_vat`.
 *    Para cada lado, se a última compra não tiver valor, usa-se o (2) correspondente.
 */

/** Tipo de movimentação */
export type StockMovementType =
  | "purchase"
  | "consumption"
  | "sale"
  | "loss"
  | "adjustment"
  | "transfer";

export type StockCategory = {
  id: string;
  name: string;
};

export type StockItem = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string;
  type: StockItemType;
  is_sellable: boolean;
  sale_price: number | null;
  purchase_reference_unit_cost_with_vat: number | null;
  purchase_reference_unit_cost_without_vat: number | null;
  min_stock: number;
  base_unit: StockBaseUnit;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  /** Calculado: SUM(stock_movements.quantity) */
  current_quantity?: number;
  last_purchase_unit_cost_with_vat?: number | null;
  last_purchase_unit_cost_without_vat?: number | null;
};

/** Indica se o item tem preço de venda configurado (vendável com valor). */
export function stockItemHasSalePricing(
  item: Pick<StockItem, "is_sellable" | "sale_price">
): boolean {
  return (
    item.is_sellable === true &&
    item.sale_price != null &&
    Number.isFinite(item.sale_price)
  );
}

/** Indica se há pelo menos um custo de referência (catálogo) preenchido. */
export function stockItemHasPurchaseReference(
  item: Pick<
    StockItem,
    | "purchase_reference_unit_cost_with_vat"
    | "purchase_reference_unit_cost_without_vat"
  >
): boolean {
  const a = item.purchase_reference_unit_cost_with_vat;
  const b = item.purchase_reference_unit_cost_without_vat;
  return (
    (a != null && Number.isFinite(a)) || (b != null && Number.isFinite(b))
  );
}

export type StockMovement = {
  id: string;
  item_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost_per_base_unit_with_vat: number | null;
  unit_cost_per_base_unit_without_vat: number | null;
  reason: string | null;
  reference: string | null;
  movement_date: string;
  created_at: string;
  created_by: string | null;
};

export type StockCategoryCreateBody = { name: string };
export type StockCategoryUpdateBody = { name: string };

export type StockItemCreateBody = {
  name: string;
  sku?: string | null;
  category_id: string;
  type: StockItemType;
  is_sellable?: boolean;
  sale_price?: number | null;
  purchase_reference_unit_cost_with_vat?: number | null;
  purchase_reference_unit_cost_without_vat?: number | null;
  min_stock?: number;
  base_unit: StockBaseUnit;
  is_active?: boolean;
};

export type StockItemUpdateBody = Partial<
  Omit<StockItemCreateBody, "category_id">
> & {
  category_id?: string;
  name?: string;
  sku?: string | null;
  type?: StockItemType;
  is_sellable?: boolean;
  sale_price?: number | null;
  purchase_reference_unit_cost_with_vat?: number | null;
  purchase_reference_unit_cost_without_vat?: number | null;
  min_stock?: number;
  base_unit?: StockBaseUnit;
  is_active?: boolean;
};

export type StockMovementCreateBody = {
  item_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost_per_base_unit_with_vat?: number | null;
  unit_cost_per_base_unit_without_vat?: number | null;
  reason?: string | null;
  reference?: string | null;
  /** Data em que a movimentação ocorreu (ISO 8601); por defeito = agora */
  movement_date?: string | null;
  created_by?: string | null;
};

export type StockMovementUpdateBody = {
  movement_date?: string | null;
  quantity?: number;
  unit_cost_per_base_unit_with_vat?: number | null;
  unit_cost_per_base_unit_without_vat?: number | null;
  reason?: string | null;
  reference?: string | null;
};
