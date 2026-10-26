/** De onde vem o custo unitário de um ingrediente: última compra importada (fatura) ou valor manual do catálogo. */
export type CostSource = "invoice" | "manual";

/** Custo atual de um artigo de stock, por unidade base (g, ml, un, …). */
export interface IngredientCost {
  stockItemId: string;
  name: string;
  baseUnit: string;
  /** Custo s/ IVA por unidade base; `null` = sem preço. */
  unitCostWithoutVat: number | null;
  source: CostSource | null;
}

/** Linha de uma ficha técnica: um artigo de stock direto ou um preparo (mutuamente exclusivos). */
export interface RecipeLine {
  stockItemId: string | null;
  preparationId: string | null;
  size: string;
  /** Na unidade base do artigo; num preparo, unidades (`useAsUnit`) ou quantidade de rendimento. */
  quantity: number;
  /** Ex.: 0.05 = 5% de perda. */
  wasteFactor: number | null;
}

export interface PreparationDefinition {
  id: string;
  name: string;
  yieldQty: number;
  useAsUnit: boolean;
  items: { stockItemId: string; quantity: number }[];
}

export interface DishDefinition {
  pizzaId: string;
  name: string;
  category: string;
  isActive: boolean;
  prices: { size: string; price: number }[];
  /** Linhas da receita ativa; `null` = o prato não tem receita ativa. */
  lines: RecipeLine[] | null;
}

/** Tudo o que o cálculo precisa, lido de uma vez. */
export interface RecipeCostingSnapshot {
  dishes: DishDefinition[];
  preparations: PreparationDefinition[];
  ingredients: IngredientCost[];
}

/** Custo de uma linha da ficha técnica (artigo direto ou preparo), já com a perda aplicada. */
export interface DishLineCost {
  stockItemId: string | null;
  preparationId: string | null;
  name: string;
  /** Quantidade da linha tal como está na ficha (unidade base do artigo, ou unidades/rendimento do preparo). */
  quantity: number;
  /** Unidade base do artigo; num preparo, `null`. */
  baseUnit: string | null;
  wasteFactor: number | null;
  /** Custo s/ IVA por unidade base do artigo (só artigos diretos com preço). */
  unitCostWithoutVat: number | null;
  /** Custo s/ IVA da linha; parcial quando `complete = false`. */
  costWithoutVat: number;
  complete: boolean;
}

/** Margem teórica s/ IVA de um tamanho (PVP sem IVA − custo). Só com custo completo e PVP. */
export interface DishMargin {
  /** PVP sem IVA, à taxa das vendas da empresa. */
  netSalePrice: number;
  marginWithoutVat: number;
  /** Margem ÷ PVP sem IVA (0,7 = 70%). */
  marginRatio: number;
  /** Custo ÷ PVP sem IVA (CMV teórico). */
  foodCostRatio: number;
}

export interface DishSizeCost {
  size: string;
  /** Custo s/ IVA do prato neste tamanho; parcial quando `complete = false`. */
  costWithoutVat: number;
  /** PVP do tamanho; `null` = sem preço de venda. */
  salePrice: number | null;
  /** `false` quando algum ingrediente usado não tem preço (o custo está subavaliado). */
  complete: boolean;
  missingStockItemIds: string[];
  /** Custo de cada linha da ficha, pela ordem da receita. */
  lines: DishLineCost[];
  /** `null` sem PVP ou com custo parcial (nunca uma margem sobre custo subavaliado). */
  margin: DishMargin | null;
}

export interface DishCosting {
  pizzaId: string;
  name: string;
  category: string;
  isActive: boolean;
  hasActiveRecipe: boolean;
  sizes: DishSizeCost[];
}

export interface MissingPriceIngredient {
  stockItemId: string;
  name: string;
  baseUnit: string;
  /** Pratos (ativos ou não) cuja receita ativa usa o ingrediente, direto ou via preparo. */
  usedIn: { pizzaId: string; name: string }[];
}

/** Custo de um lote de cada preparação (V7), com a mesma fonte de preços dos pratos. */
export interface PreparationCost {
  preparationId: string;
  name: string;
  yieldQty: number;
  useAsUnit: boolean;
  itemCount: number;
  batchCostWithoutVat: number;
  /** `false` sem ingredientes ou com algum ingrediente sem preço. */
  complete: boolean;
}

export interface RecipeCostingReport {
  /** Taxa de IVA das vendas (%) usada para a margem. */
  salesVatRate: number;
  dishes: DishCosting[];
  /** Ingredientes usados nas receitas ativas, com o custo atual e a origem. */
  ingredients: IngredientCost[];
  missingPrices: MissingPriceIngredient[];
  preparations: PreparationCost[];
}
