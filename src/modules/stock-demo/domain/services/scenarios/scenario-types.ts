/**
 * Definição de um cenário fictício do Stock (dados puros, sem I/O). Preços em € por kg / l / un (como se pensa
 * o preço); o gerador converte para a unidade base (g, ml, un). Todos os nomes de fornecedores são inventados.
 */

export type BaseUnit = "g" | "ml" | "un";
export type ItemType = "ingredient" | "beverage" | "packaging" | "cleaning" | "consumable";
/** Evolução do preço de compra nas 12 semanas: estável, a subir, salto recente, a descer. */
export type PriceTrend = "flat" | "up" | "spike" | "down";

export interface SupplierDef {
  key: string;
  name: string;
  /** Dia da semana da entrega (1 = segunda … 6 = sábado). */
  deliveryWeekday: number;
  /** Desconto comercial em % aplicado às linhas deste fornecedor (0 = sem desconto). */
  discountPct: number;
}

export interface IngredientDef {
  key: string;
  name: string;
  category: string;
  type: ItemType;
  unit: BaseUnit;
  /** € por kg (g), por litro (ml) ou por unidade (un), sem IVA, no início do período. */
  price: number;
  /** IVA da compra (%). */
  vat: number;
  supplier?: string;
  /** Embalagem de compra: unidade («saco», «lata»), conteúdo em unidade base e se a fatura conta embalagens. */
  pack?: { unit: string; content: number; invoicedBy: "package" | "content" };
  trend?: PriceTrend;
  /** Sem compras: só custo manual de referência no artigo. */
  manualOnly?: boolean;
  /** Sem compras nem custo manual: mostra «Sem custo conhecido» e fichas parciais. */
  noCost?: boolean;
  /** A última entrega vem curta: o artigo fica abaixo do mínimo (alertas e reposição). */
  lowStock?: boolean;
}

export interface PreparationDef {
  key: string;
  name: string;
  yieldQty: number;
  yieldUnit: BaseUnit;
  /** Usada à unidade nos pratos (1 = um lote). */
  asUnit?: boolean;
  items: [ingredientKey: string, quantity: number][];
}

/** Linha da ficha: [i = ingrediente | p = preparação, chave, Individual, Grande, XS (omissa = metade da Individual)]. */
export type DishLine = [kind: "i" | "p", key: string, small: number | null, large: number | null, xs?: number | null];

export interface DishDef {
  key: string;
  name: string;
  category: "classics" | "specials" | "sweeties";
  /** PVP com IVA por variante; só as variantes com preço são vendidas. */
  prices: { xs?: number; small?: number; large?: number };
  lines: DishLine[];
}

export interface ScenarioDef {
  key: "brasileira" | "hamburgueria" | "bar";
  label: string;
  /** Nome da loja fictícia. */
  locationName: string;
  /** Vendas mensais em pratos, € (50 000–70 000). */
  monthlySales: number;
  /** IVA das vendas para a margem (%). */
  salesVatRate: number;
  suppliers: SupplierDef[];
  ingredients: IngredientDef[];
  preparations: PreparationDef[];
  dishes: DishDef[];
}
