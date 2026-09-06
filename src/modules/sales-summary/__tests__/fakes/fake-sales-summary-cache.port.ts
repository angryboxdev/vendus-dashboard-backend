import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  SalesSummaryCachePort,
  SaveCacheParams,
  MonthlyGrowthRow,
} from "../../domain/ports/out/sales-summary-cache.port.js";
import type { SalesSummaryResult } from "../../domain/entities/sales-summary.js";

interface CacheEntry {
  payload: SalesSummaryResult;
  calculatedAt: Date;
  vendusRevenueCents: number;
  airMenuRevenueCents: number;
}

export class FakeSalesSummaryCachePort implements SalesSummaryCachePort {
  private readonly store = new Map<string, CacheEntry>();

  private key(orgId: OrganizationId, year: number, month: number): string {
    return `${orgId}:${year}-${month}`;
  }

  /** Seed a pre-existing cache entry (for test setup). */
  seed(
    orgId: OrganizationId,
    year: number,
    month: number,
    payload: SalesSummaryResult,
    calculatedAt: Date,
    vendusRevenueCents = 0,
    airMenuRevenueCents = 0,
  ): void {
    this.store.set(this.key(orgId, year, month), {
      payload,
      calculatedAt,
      vendusRevenueCents,
      airMenuRevenueCents,
    });
  }

  async get(
    organizationId: OrganizationId,
    year: number,
    month: number,
  ): Promise<{ payload: SalesSummaryResult; calculatedAt: Date } | null> {
    const entry = this.store.get(this.key(organizationId, year, month));
    if (!entry) return null;
    return { payload: entry.payload, calculatedAt: entry.calculatedAt };
  }

  async save(
    organizationId: OrganizationId,
    year: number,
    month: number,
    params: SaveCacheParams,
  ): Promise<void> {
    this.store.set(this.key(organizationId, year, month), {
      payload: params.payload,
      calculatedAt: new Date(),
      vendusRevenueCents: params.vendusRevenueCents,
      airMenuRevenueCents: params.airMenuRevenueCents,
    });
  }

  async getYearMonths(
    organizationId: OrganizationId,
    year: number,
  ): Promise<MonthlyGrowthRow[]> {
    const result: MonthlyGrowthRow[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (!key.startsWith(`${organizationId}:`)) continue;
      const suffix = key.slice(organizationId.length + 1);
      const [y, m] = suffix.split("-").map(Number);
      if (y !== year) continue;
      result.push({
        year: y!,
        month: m!,
        totalRevenueCents: entry.payload.totals.grossRevenue,
        vendusRevenueCents: entry.vendusRevenueCents,
        airMenuRevenueCents: entry.airMenuRevenueCents,
        calculatedAt: entry.calculatedAt,
      });
    }
    return result;
  }
}
