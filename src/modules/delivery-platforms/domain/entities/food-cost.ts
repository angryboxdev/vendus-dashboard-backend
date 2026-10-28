/**
 * Custo real da comida e da embalagem do delivery num mês (F5): produtos vendidos (SAF-T do AirMenu) ×
 * custo das fichas técnicas (pizzas e sobremesas) ou do artigo de stock (bebidas), mais a embalagem
 * por pizza e por pedido. Valores em cêntimos, sem IVA.
 */

/** A que corresponde um produto do AirMenu. */
export type ProductTargetType = "dish" | "item" | "upgrade_large" | "ignore";

/** Chaves reservadas dos artigos da embalagem (no mesmo registo dos mapeamentos). */
export const PACKAGING_KEYS = {
  boxSmall: "@box_small",
  boxLarge: "@box_large",
  bag: "@bag",
  napkin: "@napkin",
} as const;
export type PackagingKey = (typeof PACKAGING_KEYS)[keyof typeof PACKAGING_KEYS];

export interface ProductMapping {
  /** Descrição normalizada (`productKey`) ou chave reservada da embalagem. */
  productKey: string;
  productCode: string | null;
  productDescription: string;
  targetType: ProductTargetType;
  pizzaId: string | null;
  /** `xs` | `small` | `large` (só em `dish`). */
  size: string | null;
  stockItemId: string | null;
}

/** Custo de um prato por tamanho (fichas técnicas), em cêntimos. */
export interface DishCostOption {
  pizzaId: string;
  name: string;
  sizes: { size: string; costCents: number; complete: boolean }[];
}

/** Custo atual de um artigo de stock, em cêntimos por unidade base. */
export interface ItemCostOption {
  stockItemId: string;
  name: string;
  baseUnit: string;
  unitCostCents: number | null;
}

export interface ResolvedTarget {
  targetType: ProductTargetType;
  pizzaId: string | null;
  size: string | null;
  stockItemId: string | null;
  /** Nome do prato ou do artigo (com o tamanho), para mostrar. */
  label: string;
  /** `manual` = gravado pelo utilizador; `auto` = sugerido pelo nome. */
  source: "manual" | "auto";
}

export interface FoodCostLine {
  productKey: string;
  code: string;
  description: string;
  quantity: number;
  netCents: number;
  target: ResolvedTarget | null;
  unitCostCents: number | null;
  costCents: number | null;
  /** Custo conhecido e completo (ficha completa, artigo com preço). */
  complete: boolean;
}

export interface PackagingLine {
  key: PackagingKey;
  label: string;
  item: { stockItemId: string; name: string; source: "manual" | "auto" } | null;
  quantity: number;
  unitCostCents: number | null;
  costCents: number | null;
}

export interface FoodCost {
  period: { year: number; month: number; from: string; to: string };
  /** Há SAF-T com produtos no mês. */
  hasProducts: boolean;
  ordersCount: number;
  /** Vendas sem IVA dos produtos do mês (sem os ignorados). */
  revenueNetCents: number;
  /** Parte das vendas com custo conhecido. */
  costedRevenueNetCents: number;
  productsCostCents: number;
  /** Custo dos produtos sem custo conhecido, estimado pela % dos que o têm. */
  extrapolatedCostCents: number;
  packagingCostCents: number;
  totalCostCents: number;
  /** Custo total ÷ vendas sem IVA, em % (ex.: 27,4); null sem vendas com custo. */
  foodCostPct: number | null;
  complete: boolean;
  lines: FoodCostLine[];
  packaging: PackagingLine[];
  /** Opções para corrigir os mapeamentos no ecrã. */
  targets: { dishes: { pizzaId: string; name: string }[]; items: { stockItemId: string; name: string }[] };
  warnings: string[];
}
