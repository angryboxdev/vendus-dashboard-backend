import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSalesSummaryUseCase } from "../../application/use-cases/get-sales-summary.use-case.js";
import { SalesSummaryCalculatorService } from "../../domain/services/sales-summary-calculator.service.js";
import { FakeVendusSummaryPort, makeEmptyVendusSummary } from "../fakes/fake-vendus-summary.port.js";
import { FakeAirMenuSummaryPort, makeEmptyAirMenuSummary } from "../fakes/fake-air-menu-summary.port.js";
import { FakeSalesSummaryCachePort } from "../fakes/fake-sales-summary-cache.port.js";
import type { SalesSummaryResult } from "../../domain/entities/sales-summary.js";

const ORG = mintOrganizationId("test-org");
const YEAR = 2026;
const MONTH_PAST = 8;     // August 2026 — past when now = Sep 2026
const MONTH_CURRENT = 9;  // September 2026

function makeUseCase(
  vendus: FakeVendusSummaryPort,
  airMenu: FakeAirMenuSummaryPort,
  cache: FakeSalesSummaryCachePort,
) {
  return new GetSalesSummaryUseCase(vendus, airMenu, cache, new SalesSummaryCalculatorService());
}

function makeMinimalResult(grossRevenue = 1000): SalesSummaryResult {
  return {
    period: { year: YEAR, month: MONTH_PAST },
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

describe("GetSalesSummaryUseCase", () => {
  let vendus: FakeVendusSummaryPort;
  let airMenu: FakeAirMenuSummaryPort;
  let cache: FakeSalesSummaryCachePort;

  beforeEach(() => {
    vendus = new FakeVendusSummaryPort();
    airMenu = new FakeAirMenuSummaryPort();
    cache = new FakeSalesSummaryCachePort();
    jest.useFakeTimers();
    // now = 2026-09-06 (Sep 2026 is current; Aug 2026 is past)
    jest.setSystemTime(new Date("2026-09-06T10:00:00Z"));
  });

  afterEach(() => jest.useRealTimers());

  // ─── Past month — cache hit ───────────────────────────────────────────────

  it("past month, cache hit → returns cached; source ports never called", async () => {
    const cached = makeMinimalResult(5000);
    const cacheTime = new Date("2026-09-01T00:00:00Z");
    cache.seed(ORG, YEAR, MONTH_PAST, cached, cacheTime);

    const result = await makeUseCase(vendus, airMenu, cache).execute({
      organizationId: ORG,
      year: YEAR,
      month: MONTH_PAST,
      forceRefresh: false,
    });

    expect(vendus.callCount).toBe(0);
    expect(airMenu.callCount).toBe(0);
    expect(result.cachedAt).toEqual(cacheTime);
  });

  // ─── Past month — cache miss ──────────────────────────────────────────────

  it("past month, cache miss → calls source ports, saves to cache, returns result", async () => {
    vendus.set(YEAR, MONTH_PAST, makeEmptyVendusSummary());
    airMenu.set(YEAR, MONTH_PAST, makeEmptyAirMenuSummary());

    const result = await makeUseCase(vendus, airMenu, cache).execute({
      organizationId: ORG,
      year: YEAR,
      month: MONTH_PAST,
      forceRefresh: false,
    });

    expect(vendus.callCount).toBe(1);
    expect(airMenu.callCount).toBe(1);
    expect(result.period).toEqual({ year: YEAR, month: MONTH_PAST });

    // Verify saved to cache
    const saved = await cache.get(ORG, YEAR, MONTH_PAST);
    expect(saved).not.toBeNull();
  });

  // ─── Current month — TTL hit ──────────────────────────────────────────────

  it("current month, cached < 15 min → cache hit; source ports never called", async () => {
    const cachedAt = new Date("2026-09-06T09:50:00Z"); // 10 min ago (< 15 min TTL)
    cache.seed(ORG, YEAR, MONTH_CURRENT, makeMinimalResult(3000), cachedAt);

    await makeUseCase(vendus, airMenu, cache).execute({
      organizationId: ORG,
      year: YEAR,
      month: MONTH_CURRENT,
      forceRefresh: false,
    });

    expect(vendus.callCount).toBe(0);
  });

  // ─── Current month — TTL miss ─────────────────────────────────────────────

  it("current month, cached ≥ 15 min → recalculates and updates cache", async () => {
    const cachedAt = new Date("2026-09-06T09:00:00Z"); // 60 min ago (> 15 min TTL)
    cache.seed(ORG, YEAR, MONTH_CURRENT, makeMinimalResult(1000), cachedAt);
    vendus.set(YEAR, MONTH_CURRENT, { ...makeEmptyVendusSummary(), faturadoTotalCents: 7000, invoiceCount: 2 });
    airMenu.set(YEAR, MONTH_CURRENT, makeEmptyAirMenuSummary());

    const result = await makeUseCase(vendus, airMenu, cache).execute({
      organizationId: ORG,
      year: YEAR,
      month: MONTH_CURRENT,
      forceRefresh: false,
    });

    expect(vendus.callCount).toBe(1);
    expect(result.totals.faturadoTotal).toBe(7000);
  });

  // ─── forceRefresh bypasses cache ─────────────────────────────────────────

  it("forceRefresh=true on a past month → bypasses cache, overwrites it", async () => {
    const stale = makeMinimalResult(1000);
    cache.seed(ORG, YEAR, MONTH_PAST, stale, new Date());
    vendus.set(YEAR, MONTH_PAST, { ...makeEmptyVendusSummary(), faturadoTotalCents: 9000, invoiceCount: 3 });
    airMenu.set(YEAR, MONTH_PAST, makeEmptyAirMenuSummary());

    const result = await makeUseCase(vendus, airMenu, cache).execute({
      organizationId: ORG,
      year: YEAR,
      month: MONTH_PAST,
      forceRefresh: true,
    });

    expect(vendus.callCount).toBe(1);
    expect(result.totals.faturadoTotal).toBe(9000);
  });

  // ─── Source port error — cache not written ────────────────────────────────

  it("error from source port → propagates; cache not written", async () => {
    // vendus will throw (no response set)
    airMenu.set(YEAR, MONTH_PAST, makeEmptyAirMenuSummary());

    await expect(
      makeUseCase(vendus, airMenu, cache).execute({
        organizationId: ORG,
        year: YEAR,
        month: MONTH_PAST,
        forceRefresh: false,
      }),
    ).rejects.toThrow();

    const saved = await cache.get(ORG, YEAR, MONTH_PAST);
    expect(saved).toBeNull();
  });
});
