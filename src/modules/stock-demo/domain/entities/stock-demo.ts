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

/** Produto vendido pelo POS fictício (um prato numa variante), com o PVP com IVA. */
export interface PosProduct {
  reference: string;
  title: string;
  pizzaId: string;
  size: string;
  /** PVP com IVA, em cêntimos. */
  priceCents: number;
}

/** Vendas de um produto num dia (o que a «API» do POS fictício devolve). */
export interface PosDailySale {
  date: string;
  reference: string;
  title: string;
  pizzaId: string;
  size: string;
  quantity: number;
  grossCents: number;
}
