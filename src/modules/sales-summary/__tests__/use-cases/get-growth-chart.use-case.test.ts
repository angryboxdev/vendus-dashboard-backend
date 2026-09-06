import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetGrowthChartUseCase } from "../../application/use-cases/get-growth-chart.use-case.js";
import { GetSalesSummaryUseCase } from "../../application/use-cases/get-sales-summary.use-case.js";
import { SalesSummaryCalculatorService } from "../../domain/services/sales-summary-calculator.service.js";
import { FakeVendusSummaryPort, makeEmptyVendusSummary } from "../fakes/fake-vendus-summary.port.js";
import { FakeAirMenuSummaryPort, makeEmptyAirMenuSummary } from "../fakes/fake-air-menu-summary.port.js";
import { FakeSalesSummaryCachePort } from "../fakes/fake-sales-summary-cache.port.js";
import type { SalesSummaryResult } from "../../domain/entities/sales-summary.js";

const ORG = mintOrganizationId("test-org");

function makeMinimalResult(grossRevenue = 1000, year = 2026, month = 1): SalesSummaryResult {
  return {
    period: { year, month },
    cachedAt: new Date(),
    totals: {
      grossRevenue,
      faturadoTotal: grossRevenue,
      vatCollected: 0,
      netRevenue: grossRevenue,
      transactionCount: 1,
      averageTicket: grossRevenue,
      creditNoteCount: 0,
      creditNoteValue: 0,
    },
    byChannel: [],
    byCategory: [],
    topProducts: [],
    temporalDistribution: [],
  };
}

describe("GetGrowthChartUseCase", () => {
  let vendus: FakeVendusSummaryPort;
  let airMenu: FakeAirMenuSummaryPort;
  let cache: FakeSalesSummaryCachePort;
  let getSalesSummary: GetSalesSummaryUseCase;

  beforeEach(() => {
    vendus = new FakeVendusSummaryPort();
    airMenu = new FakeAirMenuSummaryPort();
    cache = new FakeSalesSummaryCachePort();
    getSalesSummary = new GetSalesSummaryUseCase(
      vendus,
      airMenu,
      cache,
      new SalesSummaryCalculatorService(),
    );
    jest.useFakeTimers();
    // now = 2026-09-06 → current year=2026, month=9; months 1-8 are past; 10-12 are future
    jest.setSystemTime(new Date("2026-09-06T10:00:00Z"));
  });

  afterEach(() => jest.useRealTimers());

  // ─── All cached ───────────────────────────────────────────────────────────

  it("all 12 months cached → returns immediately; source ports never called", async () => {
    for (let m = 1; m <= 9; m++) {
      cache.seed(ORG, 2026, m, makeMinimalResult(1000, 2026, m), new Date());
    }
    // months 10-12 are future — won't be queried

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    expect(vendus.callCount).toBe(0);
    expect(result).toHaveLength(12);
  });

  // ─── Partial cache ────────────────────────────────────────────────────────

  it("3 missing past months → source ports called exactly 3 times, sequentially", async () => {
    // Seed months 1-6 in cache; 7,8,9 missing; 10-12 future
    for (let m = 1; m <= 6; m++) {
      cache.seed(ORG, 2026, m, makeMinimalResult(500 * m, 2026, m), new Date());
    }
    // Provide source port responses for missing months 7, 8, 9
    for (let m = 7; m <= 9; m++) {
      vendus.set(2026, m, makeEmptyVendusSummary());
      airMenu.set(2026, m, makeEmptyAirMenuSummary());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    expect(vendus.callCount).toBe(3);
    expect(result).toHaveLength(12);
  });

  // ─── Exact 12 entries ─────────────────────────────────────────────────────

  it("always returns exactly 12 entries for the year", async () => {
    // Seed only some months; rest will be computed or be future/failed
    cache.seed(ORG, 2026, 1, makeMinimalResult(1000, 2026, 1), new Date());
    for (let m = 2; m <= 9; m++) {
      vendus.set(2026, m, makeEmptyVendusSummary());
      airMenu.set(2026, m, makeEmptyAirMenuSummary());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    expect(result).toHaveLength(12);
    expect(result.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  // ─── Future months ────────────────────────────────────────────────────────

  it("future months have cachedAt=null and zero revenue", async () => {
    for (let m = 1; m <= 9; m++) {
      cache.seed(ORG, 2026, m, makeMinimalResult(1000, 2026, m), new Date());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    const future = result.filter((r) => r.month >= 10);
    expect(future).toHaveLength(3);
    for (const f of future) {
      expect(f.cachedAt).toBeNull();
      expect(f.totalRevenue).toBe(0);
    }
  });

  // ─── Failed calculation ───────────────────────────────────────────────────

  it("failed month calculation → cachedAt=null, zeros; does not abort the loop", async () => {
    // month 5 will fail (no source port response); others will have data
    for (let m = 1; m <= 9; m++) {
      if (m !== 5) {
        cache.seed(ORG, 2026, m, makeMinimalResult(1000, 2026, m), new Date());
      }
      // month 5 not seeded in cache, no source response → will throw
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    const may = result.find((r) => r.month === 5)!;
    expect(may.cachedAt).toBeNull();
    expect(may.totalRevenue).toBe(0);

    // Other past months still populated
    const jan = result.find((r) => r.month === 1)!;
    expect(jan.cachedAt).not.toBeNull();
  });

  // ─── Current month TTL ────────────────────────────────────────────────────

  it("current month stale (≥15 min) → recalculates even though cached", async () => {
    // Cache month 9 with a calculatedAt 20 minutes ago (stale)
    const staleAt = new Date("2026-09-06T09:40:00Z");
    cache.seed(ORG, 2026, 9, makeMinimalResult(9999, 2026, 9), staleAt);
    vendus.set(2026, 9, makeEmptyVendusSummary());
    airMenu.set(2026, 9, makeEmptyAirMenuSummary());
    // Seed other past months so they don't trigger calls
    for (let m = 1; m <= 8; m++) {
      cache.seed(ORG, 2026, m, makeMinimalResult(500, 2026, m), new Date());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    await uc.execute({ organizationId: ORG, year: 2026 });

    expect(vendus.callCount).toBe(1);
  });

  it("current month fresh (<15 min) → served from cache; no source call", async () => {
    const freshAt = new Date("2026-09-06T09:50:00Z"); // 10 min ago — fresh
    cache.seed(ORG, 2026, 9, makeMinimalResult(5000, 2026, 9), freshAt);
    for (let m = 1; m <= 8; m++) {
      cache.seed(ORG, 2026, m, makeMinimalResult(500, 2026, m), new Date());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    await uc.execute({ organizationId: ORG, year: 2026 });

    expect(vendus.callCount).toBe(0);
  });

  // ─── Cached values passed through correctly ───────────────────────────────

  it("uses vendusRevenueCents / airMenuRevenueCents from cache rows for growth chart", async () => {
    cache.seed(ORG, 2026, 3, makeMinimalResult(10000, 2026, 3), new Date(), 7000, 3000);
    for (let m = 1; m <= 9; m++) {
      if (m !== 3) cache.seed(ORG, 2026, m, makeMinimalResult(500, 2026, m), new Date());
    }

    const uc = new GetGrowthChartUseCase(cache, getSalesSummary);
    const result = await uc.execute({ organizationId: ORG, year: 2026 });

    const mar = result.find((r) => r.month === 3)!;
    expect(mar.vendusRevenue).toBe(7000);
    expect(mar.airMenuRevenue).toBe(3000);
    expect(mar.totalRevenue).toBe(10000);
  });
});
