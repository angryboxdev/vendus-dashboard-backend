import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAnalyticsHistoricalUseCase } from "../../application/use-cases/get-analytics-historical.use-case.js";
import { FakeVendusGateway } from "../fakes/fake-vendus-gateway.js";
import { FakeAnalyticsCache } from "../fakes/fake-analytics-cache.js";
import type { VendusDocument } from "../../domain/entities/vendus-document.js";
import type { CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";

const organizationId = mintOrganizationId("org-a");

function makeDoc(id: number, date: string, amount: string, type = "FS"): VendusDocument {
  return {
    id, type, number: `${type} 1/${id}`, date,
    amount_gross: amount, amount_net: amount,
    store_id: 1, register_id: 1,
  };
}

function makeCacheRow(year: number, month: number, gross_cents: number, documents_count = 1): CachedMonthRow {
  return { year, month, gross_cents, documents_count };
}

describe("GetAnalyticsHistoricalUseCase", () => {
  let gateway: FakeVendusGateway;
  let cache: FakeAnalyticsCache;

  beforeEach(() => {
    gateway = new FakeVendusGateway();
    cache = new FakeAnalyticsCache();
    jest.useFakeTimers();
    // now = 2026-08-04T13:00 Lisbon (UTC+1 no verão)
    jest.setSystemTime(new Date("2026-08-04T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeUseCase(historyStartYear = 2025) {
    return new GetAnalyticsHistoricalUseCase(gateway, cache, historyStartYear);
  }

  // ─── Cache hit completo ───────────────────────────────────────────────────────

  describe("all data in cache", () => {
    it("saves no rows when cache is complete", async () => {
      const rows: CachedMonthRow[] = [];
      for (let m = 1; m <= 12; m++) rows.push(makeCacheRow(2025, m, 10000, 2));
      for (let m = 1; m <= 7; m++) rows.push(makeCacheRow(2026, m, 5000, 1));
      cache.seed(organizationId, rows);
      gateway.setDocuments([]);

      await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      expect(cache.savedRows).toHaveLength(0);
    });

    it("annual gross = sum of cached months 1-7 of 2026 + current month (fresh)", async () => {
      const rows: CachedMonthRow[] = [];
      for (let m = 1; m <= 12; m++) rows.push(makeCacheRow(2025, m, 0, 0));
      // meses 1-7 de 2026: 5000 cêntimos cada = 50 EUR cada
      for (let m = 1; m <= 7; m++) rows.push(makeCacheRow(2026, m, 5000, 1));
      cache.seed(organizationId, rows);
      // mês corrente (Ago 2026): 200 EUR via gateway
      gateway.setDocuments([makeDoc(1, "2026-08-01", "200.00")]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      // 7 × 50 EUR + 200 EUR = 550 EUR
      expect(result.annual.gross).toBe(550);
      expect(result.annual.year).toBe(2026);
    });

    it("historical gross = annual + all past years", async () => {
      const rows: CachedMonthRow[] = [];
      // 2025: 12 × 100 EUR = 1200 EUR
      for (let m = 1; m <= 12; m++) rows.push(makeCacheRow(2025, m, 10000, 1));
      // 2026 meses 1-7: 0
      for (let m = 1; m <= 7; m++) rows.push(makeCacheRow(2026, m, 0, 0));
      cache.seed(organizationId, rows);
      gateway.setDocuments([]); // mês corrente: 0

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      // annual = 0; historical = 0 + 1200 EUR (2025)
      expect(result.historical.gross).toBe(1200);
      expect(result.historical.since).toBe("2025-01-01");
    });

    it("does not read another organization's cached rows", async () => {
      const otherOrganizationId = mintOrganizationId("org-b");
      const rows: CachedMonthRow[] = [];
      for (let m = 1; m <= 12; m++) rows.push(makeCacheRow(2025, m, 10000, 1));
      cache.seed(otherOrganizationId, rows);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      // org-a has nothing cached, so org-b's 2025 rows must not leak in.
      expect(result.historical.gross).toBe(0);
    });
  });

  // ─── Cache miss ───────────────────────────────────────────────────────────────

  describe("past year missing from cache", () => {
    it("fetches and saves all 12 months of the missing past year", async () => {
      cache.seed(organizationId, []);
      // Gateway devolve sempre estes docs independentemente dos params.
      // computeAndCache filtra por data, por isso apenas Jan 2025 terá gross > 0.
      gateway.setDocuments([
        makeDoc(1, "2025-01-15", "200.00"), // 20000 cêntimos
        makeDoc(2, "2026-08-01", "100.00"), // mês corrente
      ]);

      await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      const saved2025 = cache.savedRows.filter((r) => r.year === 2025);
      expect(saved2025).toHaveLength(12);

      const jan2025 = saved2025.find((r) => r.month === 1)!;
      expect(jan2025.gross_cents).toBe(20000);
      expect(jan2025.documents_count).toBe(1);

      const feb2025 = saved2025.find((r) => r.month === 2)!;
      expect(feb2025.gross_cents).toBe(0);
    });

    it("fetches and saves missing current-year past months", async () => {
      // historyStartYear = 2026 → sem anos passados a buscar
      // meses 1-7 de 2026 todos em falta
      cache.seed(organizationId, []);
      gateway.setDocuments([makeDoc(1, "2026-03-10", "300.00")]); // 30000 cêntimos

      await makeUseCase(2026).execute({ organizationId, year: 2026, month: 8 });

      const saved2026 = cache.savedRows.filter((r) => r.year === 2026);
      expect(saved2026.length).toBeGreaterThan(0);

      const mar2026 = saved2026.find((r) => r.month === 3)!;
      expect(mar2026.gross_cents).toBe(30000);
      expect(mar2026.documents_count).toBe(1);

      const jan2026 = saved2026.find((r) => r.month === 1)!;
      expect(jan2026.gross_cents).toBe(0);
    });
  });

  // ─── Growth chart ─────────────────────────────────────────────────────────────

  describe("monthly_growth", () => {
    it("always has exactly 6 slots", async () => {
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      expect(result.monthly_growth).toHaveLength(6);
    });

    it("slots cover the last 6 months in chronological order", async () => {
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      // Ago 2026 − 5 meses = Mar 2026
      const months = result.monthly_growth.map((s) => `${s.year}-${s.month}`);
      expect(months).toEqual(["2026-3", "2026-4", "2026-5", "2026-6", "2026-7", "2026-8"]);
    });

    it("last slot is the current month", async () => {
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      const last = result.monthly_growth[5]!;
      expect(last.year).toBe(2026);
      expect(last.month).toBe(8);
    });

    it("current slot uses fresh gateway data", async () => {
      cache.seed(organizationId, []);
      gateway.setDocuments([makeDoc(1, "2026-08-01", "500.00")]);

      const result = await makeUseCase(2026).execute({ organizationId, year: 2026, month: 8 });

      const currentSlot = result.monthly_growth.find((s) => s.year === 2026 && s.month === 8)!;
      expect(currentSlot.gross).toBe(500);
    });

    it("past slots use cached data", async () => {
      cache.seed(organizationId, [makeCacheRow(2026, 7, 75000, 10)]);
      gateway.setDocuments([]);

      const result = await makeUseCase(2026).execute({ organizationId, year: 2026, month: 8 });

      const julSlot = result.monthly_growth.find((s) => s.year === 2026 && s.month === 7)!;
      expect(julSlot.gross).toBe(750);
      expect(julSlot.documents_count).toBe(10);
    });

    it("slots without cached data show gross=0", async () => {
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2026).execute({ organizationId, year: 2026, month: 8 });

      const julSlot = result.monthly_growth.find((s) => s.year === 2026 && s.month === 7)!;
      expect(julSlot.gross).toBe(0);
      expect(julSlot.documents_count).toBe(0);
    });
  });

  // ─── Comparisons ──────────────────────────────────────────────────────────────

  describe("comparisons.prev_month", () => {
    it("is populated from cache when previous month is available", async () => {
      cache.seed(organizationId, [makeCacheRow(2026, 7, 93000, 15)]);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      const pm = result.comparisons.prev_month!;
      expect(pm.year).toBe(2026);
      expect(pm.month).toBe(7);
      expect(pm.gross).toBe(930);
      expect(pm.documents_count).toBe(15);
      // daily_avg = 93000 / 31 dias / 100 ≈ 30
      expect(pm.daily_avg).toBeCloseTo(30, 0);
    });

    it("is null when previous month is before historyStartYear", async () => {
      // year=2026, month=1 → prev = Dec 2025 < historyStartYear=2026
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2026).execute({ organizationId, year: 2026, month: 1 });

      expect(result.comparisons.prev_month).toBeNull();
    });
  });

  describe("comparisons.prev_year_ytd", () => {
    it("sums months 1 through current month of previous year", async () => {
      // year=2026, month=8 → prev year = 2025, meses 1-8
      const rows: CachedMonthRow[] = [];
      // gross_cents do mês m = m * 10000 cêntimos = m * 100 EUR
      for (let m = 1; m <= 12; m++) rows.push(makeCacheRow(2025, m, m * 10000, 1));
      cache.seed(organizationId, rows);
      gateway.setDocuments([]);

      const result = await makeUseCase(2025).execute({ organizationId, year: 2026, month: 8 });

      // soma(1..8) = 36; 36 × 100 EUR = 3600 EUR
      expect(result.comparisons.prev_year_ytd!.gross).toBe(3600);
      expect(result.comparisons.prev_year_ytd!.year).toBe(2025);
    });

    it("is null when previous year is before historyStartYear", async () => {
      // historyStartYear=2026 → ano 2025 não é considerado
      cache.seed(organizationId, []);
      gateway.setDocuments([]);

      const result = await makeUseCase(2026).execute({ organizationId, year: 2026, month: 8 });

      expect(result.comparisons.prev_year_ytd).toBeNull();
    });
  });
});
