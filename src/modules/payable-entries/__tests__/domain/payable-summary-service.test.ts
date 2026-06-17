import { PayableEntry } from "../../domain/entities/payable-entry.js";
import { PayableSummaryService } from "../../domain/services/payable-summary.service.js";

const TODAY = new Date("2026-07-10");

function make(overrides: Partial<Parameters<typeof PayableEntry.create>[0]> = {}) {
  return PayableEntry.create({
    supplierName: "S",
    description: "D",
    amount: 10000,
    dueDate: new Date("2026-07-15"),
    ...overrides,
  });
}

describe("PayableSummaryService", () => {
  const service = new PayableSummaryService();

  describe("computeSummary", () => {
    it("counts pending and overdue in totalDue", () => {
      const entries = [
        make({ amount: 10000 }),
        make({ amount: 20000 }).markOverdue(),
        make({ amount: 5000 }).markPaid(new Date("2026-07-01")),
      ];
      const summary = service.computeSummary(entries, TODAY);
      expect(summary.totalDue).toBe(30000);
    });

    it("counts only overdue in totalOverdue", () => {
      const entries = [make({ amount: 10000 }).markOverdue(), make({ amount: 20000 })];
      const summary = service.computeSummary(entries, TODAY);
      expect(summary.totalOverdue).toBe(10000);
    });

    it("counts pending entries due within 7 days in dueSoon7Days", () => {
      // TODAY = 2026-07-10, window = 2026-07-10 to 2026-07-17
      const entries = [
        make({ amount: 5000, dueDate: new Date("2026-07-12") }), // within window
        make({ amount: 8000, dueDate: new Date("2026-07-18") }), // outside window
        make({ amount: 3000, dueDate: new Date("2026-07-10") }), // today — within
      ];
      const summary = service.computeSummary(entries, TODAY);
      expect(summary.dueSoon7Days).toBe(8000);
    });

    it("counts paid entries in current month for paidThisMonth", () => {
      const entries = [
        make({ amount: 12000 }).markPaid(new Date("2026-07-05")),  // this month
        make({ amount: 4000 }).markPaid(new Date("2026-06-30")),   // last month
        make({ amount: 3000 }),                                     // not paid
      ];
      const summary = service.computeSummary(entries, TODAY);
      expect(summary.paidThisMonth).toBe(12000);
    });

    it("returns all zeros for empty list", () => {
      const summary = service.computeSummary([], TODAY);
      expect(summary).toEqual({ totalDue: 0, totalOverdue: 0, dueSoon7Days: 0, paidThisMonth: 0 });
    });
  });

  describe("groupByDay", () => {
    it("groups entries by dueDate and sums amounts", () => {
      const entries = [
        make({ amount: 5000, dueDate: new Date("2026-07-10") }),
        make({ amount: 3000, dueDate: new Date("2026-07-10") }),
        make({ amount: 8000, dueDate: new Date("2026-07-15") }),
      ];
      const days = service.groupByDay(entries);
      expect(days).toHaveLength(2);
      expect(days[0].date).toBe("2026-07-10");
      expect(days[0].totalAmount).toBe(8000);
      expect(days[0].entries).toHaveLength(2);
      expect(days[1].date).toBe("2026-07-15");
      expect(days[1].totalAmount).toBe(8000);
    });

    it("returns sorted by date ascending", () => {
      const entries = [
        make({ dueDate: new Date("2026-07-20") }),
        make({ dueDate: new Date("2026-07-05") }),
      ];
      const days = service.groupByDay(entries);
      expect(days[0].date).toBe("2026-07-05");
      expect(days[1].date).toBe("2026-07-20");
    });
  });
});
