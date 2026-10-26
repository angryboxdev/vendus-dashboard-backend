import type { OrganizationId } from "../../../../kernel/organization-id.js";

/** Cenários fictícios do Stock. */
export type StockDemoScenario = "brasileira" | "hamburgueria" | "bar";
export const STOCK_DEMO_SCENARIOS: StockDemoScenario[] = ["brasileira", "hamburgueria", "bar"];
export const STOCK_DEMO_SCENARIO_LABELS: Record<StockDemoScenario, string> = {
  brasileira: "Comida brasileira",
  hamburgueria: "Hamburgueria",
  bar: "Bar",
};

export function isStockDemoScenario(v: unknown): v is StockDemoScenario {
  return typeof v === "string" && (STOCK_DEMO_SCENARIOS as string[]).includes(v);
}

/** Nome do POS fictício (inventado; não é um software real). */
export const DEMO_POS_NAME = "CaixaFlow POS";

/** Ligação empresa real → organização fictícia de um cenário. */
export interface StockDemoLink {
  realOrgId: OrganizationId;
  scenario: StockDemoScenario;
  demoOrgId: OrganizationId;
  seed: number;
  monthlySalesTargetCents: number;
  posName: string;
  posApiKeyHint: string;
  createdAt: string;
}

/**
 * Produto vendido pelo POS fictício, com o PVP com IVA: um prato numa variante (`dish`, baixa pela ficha técnica)
 * ou um artigo vendido tal como vem (`item`, ex.: água ou refrigerante — baixa de 1 unidade do artigo).
 */
export interface PosProduct {
  reference: string;
  title: string;
  kind: "dish" | "item";
  /** Prato e variante (só `dish`). */
  pizzaId: string | null;
  size: string | null;
  /** Artigo vendido avulso (só `item`). */
  stockItemId: string | null;
  /** PVP com IVA, em cêntimos. */
  priceCents: number;
}

/** Vendas de um produto num dia (o que a «API» do POS fictício devolve). */
export interface PosDailySale {
  date: string;
  reference: string;
  title: string;
  kind: "dish" | "item";
  pizzaId: string | null;
  size: string | null;
  stockItemId: string | null;
  quantity: number;
  grossCents: number;
}

/** Fonte de procura do planeamento: `pizza` → «<prato>:<variante>», `stock` → «<artigo>» (mesma identidade das vendas reais). */
export function demandSourceOf(p: Pick<PosProduct, "kind" | "pizzaId" | "size" | "stockItemId">): { type: "pizza" | "stock"; ref: string } {
  return p.kind === "item" ? { type: "stock", ref: p.stockItemId! } : { type: "pizza", ref: `${p.pizzaId}:${p.size}` };
}
