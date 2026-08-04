import { GetAnalyticsCurrentUseCase } from "../../application/use-cases/get-analytics-current.use-case.js";
import { FakeVendusGateway } from "../fakes/fake-vendus-gateway.js";
import type { VendusDocument } from "../../domain/entities/vendus-document.js";

function makeDoc(id: number, date: string, amount: string, type = "FS"): VendusDocument {
  return {
    id, type, number: `${type} 1/${id}`, date,
    amount_gross: amount, amount_net: amount,
    store_id: 1, register_id: 1,
  };
}

describe("GetAnalyticsCurrentUseCase", () => {
  let gateway: FakeVendusGateway;
  let useCase: GetAnalyticsCurrentUseCase;

  beforeEach(() => {
    gateway = new FakeVendusGateway();
    useCase = new GetAnalyticsCurrentUseCase(gateway);
    jest.useFakeTimers();
    // now = 2026-08-04T13:00 Lisbon (UTC+1 no verão)
    jest.setSystemTime(new Date("2026-08-04T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Mês passado ─────────────────────────────────────────────────────────────

  describe("past month (July 2026)", () => {
    it("today is null and daysElapsed equals the full month", async () => {
      gateway.setDocuments([makeDoc(1, "2026-07-10", "100.00")]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.today).toBeNull();
      expect(result.period.is_current_month).toBe(false);
      expect(result.month.days_elapsed).toBe(31);
      expect(result.month.days_in_month).toBe(31);
    });

    it("sums gross correctly for FS docs", async () => {
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "100.00"),
        makeDoc(2, "2026-07-15", "50.00"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.month.gross).toBe(150);
      expect(result.month.documents_count).toBe(2);
    });

    it("NC is subtracted from gross and excluded from document_count", async () => {
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "100.00"),
        makeDoc(2, "2026-07-01", "100.00", "NC"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.month.gross).toBe(0);
      expect(result.month.documents_count).toBe(1);
    });

    it("avg_ticket = gross / document_count", async () => {
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "30.00"),
        makeDoc(2, "2026-07-02", "70.00"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.month.avg_ticket).toBe(50);
    });

    it("returns zeros for empty period", async () => {
      gateway.setDocuments([]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.month.gross).toBe(0);
      expect(result.month.documents_count).toBe(0);
      expect(result.month.daily_avg).toBe(0);
      expect(result.month.avg_ticket).toBe(0);
      expect(result.month.expected_gross).toBe(0);
    });
  });

  // ─── Mês corrente ─────────────────────────────────────────────────────────────

  describe("current month (August 2026, day 4)", () => {
    it("today is present and is_current_month is true", async () => {
      gateway.setDocuments([makeDoc(1, "2026-08-01", "90.00")]);

      const result = await useCase.execute({ year: 2026, month: 8 });

      expect(result.period.is_current_month).toBe(true);
      expect(result.today).not.toBeNull();
    });

    it("daysElapsed = day - 1 = 3", async () => {
      gateway.setDocuments([makeDoc(1, "2026-08-01", "90.00")]);

      const result = await useCase.execute({ year: 2026, month: 8 });

      expect(result.month.days_elapsed).toBe(3);
    });

    it("daily_avg = monthGross / daysElapsed", async () => {
      // O fake devolve sempre os mesmos docs para qualquer chamada.
      // monthGross = 90; daysElapsed = 3 → daily_avg = 30
      gateway.setDocuments([makeDoc(1, "2026-08-01", "90.00")]);

      const result = await useCase.execute({ year: 2026, month: 8 });

      expect(result.month.daily_avg).toBe(30);
    });

    it("a past month of the same year returns today=null", async () => {
      gateway.setDocuments([makeDoc(1, "2026-06-15", "50.00")]);

      const result = await useCase.execute({ year: 2026, month: 6 });

      expect(result.today).toBeNull();
      expect(result.period.is_current_month).toBe(false);
    });
  });

  // ─── by_weekday ──────────────────────────────────────────────────────────────

  describe("by_weekday", () => {
    it("always produces exactly 7 entries (weekdays 1–7)", async () => {
      gateway.setDocuments([]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      expect(result.by_weekday).toHaveLength(7);
      expect(result.by_weekday.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("accumulates gross and count for the correct weekday", async () => {
      // 2026-07-01 é Quarta-feira (weekday=3 no Luxon)
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "100.00"),
        makeDoc(2, "2026-07-01", "50.00"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      const wed = result.by_weekday.find((w) => w.weekday === 3)!;
      expect(wed.gross).toBe(150);
      expect(wed.documents_count).toBe(2);
      expect(wed.days_count).toBe(1); // mesma data → 1 dia único
      expect(wed.avg_gross).toBe(150); // 150 / 1 dia
    });

    it("NC is excluded from weekday document_count", async () => {
      // 2026-07-01 é Quarta-feira
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "100.00"),
        makeDoc(2, "2026-07-01", "100.00", "NC"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      const wed = result.by_weekday.find((w) => w.weekday === 3)!;
      expect(wed.documents_count).toBe(1);
    });

    it("two different dates in the same weekday count as 2 distinct days", async () => {
      // 2026-07-01 e 2026-07-08 são ambas Quartas-feiras
      gateway.setDocuments([
        makeDoc(1, "2026-07-01", "80.00"),
        makeDoc(2, "2026-07-08", "40.00"),
      ]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      const wed = result.by_weekday.find((w) => w.weekday === 3)!;
      expect(wed.days_count).toBe(2);
      expect(wed.avg_gross).toBe(60); // 120 / 2 dias
    });

    it("weekdays with no sales have gross=0 and counts=0", async () => {
      // Only one Wednesday — other weekdays are empty
      gateway.setDocuments([makeDoc(1, "2026-07-01", "50.00")]);

      const result = await useCase.execute({ year: 2026, month: 7 });

      const mon = result.by_weekday.find((w) => w.weekday === 1)!;
      expect(mon.gross).toBe(0);
      expect(mon.documents_count).toBe(0);
      expect(mon.days_count).toBe(0);
    });
  });
});
