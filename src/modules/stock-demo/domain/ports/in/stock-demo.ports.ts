import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PosDailySale, StockDemoScenario } from "../../entities/stock-demo.js";

export interface StockDemoScenarioStatusDTO {
  scenario: StockDemoScenario;
  label: string;
  created: boolean;
  posName: string | null;
  posApiKeyHint: string | null;
  monthlySalesTargetCents: number | null;
}

/** Estado dos três cenários da empresa real (botão «Demonstração» em Artigos e ingredientes). */
export interface GetStockDemoStatusPort {
  execute(command: { realOrgId: OrganizationId; isAdmin: boolean }): Promise<{ scenarios: StockDemoScenarioStatusDTO[] }>;
}

/** Linha de procura por prato/variante num dia (mesmo formato das vendas reais do planeamento). */
export interface DemoDemandRow {
  demandSourceType: "pizza" | "stock";
  demandSourceRef: string;
  saleDate: string;
  quantitySold: number;
}

/**
 * «API» do POS fictício: vendas de uma organização de demonstração do Stock. `null` quando a organização não
 * é uma demo do Stock — os leitores reais seguem então para a Vendus.
 */
export interface DemoPosSalesPort {
  dailySales(org: OrganizationId, from: string, to: string): Promise<PosDailySale[] | null>;
  dailyDemand(org: OrganizationId, date: string): Promise<DemoDemandRow[] | null>;
}

/** Troca de organização no modo Demonstração do Stock (middleware). */
export interface ResolveStockDemoPort {
  execute(realOrg: OrganizationId, scenario: StockDemoScenario): Promise<OrganizationId | null>;
}

export class StockDemoForbiddenError extends Error {}

export interface StockDemoSeedResultDTO {
  scenario: StockDemoScenario;
  created: boolean;
  summary: { items: number; suppliers: number; invoices: number; dishes: number; preparations: number; salesCents30d: number; movements: number } | null;
  /** Previsão de reposição calculada (falhar a previsão não desfaz a demonstração). */
  forecast: "ok" | "failed";
}

/** Criar um cenário (só Admin): organização fictícia + dados. Já criado → devolve sem mexer. */
export interface CreateStockDemoPort {
  execute(command: { realOrgId: OrganizationId; isAdmin: boolean; actor: string; scenario: StockDemoScenario }): Promise<StockDemoSeedResultDTO>;
}

/** Recomeçar um cenário (só Admin): apaga os dados da organização fictícia e volta a semear até hoje. */
export interface ResetStockDemoPort {
  execute(command: { realOrgId: OrganizationId; isAdmin: boolean; scenario: StockDemoScenario }): Promise<StockDemoSeedResultDTO>;
}

export class StockDemoNotCreatedError extends Error {}
