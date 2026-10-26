import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  STOCK_DEMO_SCENARIO_LABELS,
  STOCK_DEMO_SCENARIOS,
  demandSourceOf,
  type PosDailySale,
  type StockDemoLink,
  type StockDemoScenario,
} from "../../domain/entities/stock-demo.js";
import {
  StockDemoForbiddenError,
  type DemoDemandRow,
  type DemoPosSalesPort,
  type GetStockDemoStatusPort,
  type ResolveStockDemoPort,
  type StockDemoScenarioStatusDTO,
} from "../../domain/ports/in/stock-demo.ports.js";
import type { PosCatalogReadPort, StockDemoRepositoryPort } from "../../domain/ports/out/stock-demo.ports.js";
import { daysBetween, simulateDailySales } from "../../domain/services/pos-sales.service.js";

export class GetStockDemoStatusUseCase implements GetStockDemoStatusPort {
  constructor(private readonly repo: StockDemoRepositoryPort) {}

  async execute(command: { realOrgId: OrganizationId; isAdmin: boolean }): Promise<{ scenarios: StockDemoScenarioStatusDTO[] }> {
    if (!command.isAdmin) throw new StockDemoForbiddenError("A demonstração do Stock está disponível só para Admins.");
    const links = await this.repo.listForRealOrg(command.realOrgId);
    return {
      scenarios: STOCK_DEMO_SCENARIOS.map((scenario) => {
        const link = links.find((l) => l.scenario === scenario);
        return {
          scenario,
          label: STOCK_DEMO_SCENARIO_LABELS[scenario],
          created: !!link,
          posName: link?.posName ?? null,
          posApiKeyHint: link?.posApiKeyHint ?? null,
          monthlySalesTargetCents: link?.monthlySalesTargetCents ?? null,
        };
      }),
    };
  }
}

const CACHE_MS = 60_000;

/** Empresa real + cenário → organização fictícia (cache 60 s; corre a cada pedido em demonstração). */
export class ResolveStockDemoUseCase implements ResolveStockDemoPort {
  private readonly cache = new Map<string, { at: number; value: OrganizationId | null }>();

  constructor(private readonly repo: StockDemoRepositoryPort, private readonly now: () => number = Date.now) {}

  async execute(realOrg: OrganizationId, scenario: StockDemoScenario): Promise<OrganizationId | null> {
    const key = `${realOrg}:${scenario}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.value;
    const link = await this.repo.findByScenario(realOrg, scenario);
    const value = link?.demoOrgId ?? null;
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  /** Depois de criar ou recomeçar um cenário. */
  forget(realOrg: OrganizationId): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${realOrg}:`)) this.cache.delete(k);
  }
}

/**
 * «API» do CaixaFlow POS (fictício): vendas simuladas a partir dos pratos mapeados e dos PVP da própria
 * organização de demonstração. Organizações que não são demo do Stock → `null` (o chamador usa a Vendus).
 */
export class DemoPosSalesUseCase implements DemoPosSalesPort {
  private readonly links = new Map<string, { at: number; value: StockDemoLink | null }>();

  constructor(
    private readonly repo: StockDemoRepositoryPort,
    private readonly catalog: PosCatalogReadPort,
    private readonly now: () => number = Date.now,
  ) {}

  private async link(org: OrganizationId): Promise<StockDemoLink | null> {
    const hit = this.links.get(org);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.value;
    const value = await this.repo.findByDemoOrg(org);
    this.links.set(org, { at: this.now(), value });
    return value;
  }

  async dailySales(org: OrganizationId, from: string, to: string): Promise<PosDailySale[] | null> {
    const link = await this.link(org);
    if (!link) return null;
    const products = await this.catalog.listProducts(org);
    const settings = { seed: link.seed, monthlySalesTargetCents: link.monthlySalesTargetCents };
    return daysBetween(from, to).flatMap((day) => simulateDailySales(products, day, settings));
  }

  async dailyDemand(org: OrganizationId, date: string): Promise<DemoDemandRow[] | null> {
    const sales = await this.dailySales(org, date, date);
    if (!sales) return null;
    const bySource = new Map<string, DemoDemandRow>();
    for (const s of sales) {
      const { type, ref } = demandSourceOf(s);
      const row = bySource.get(`${type}:${ref}`) ?? { demandSourceType: type, demandSourceRef: ref, saleDate: date, quantitySold: 0 };
      row.quantitySold += s.quantity;
      bySource.set(`${type}:${ref}`, row);
    }
    return [...bySource.values()];
  }
}

export type { StockDemoScenario };
