import { PayableEntry } from "../../domain/entities/payable-entry.js";

function makeEntry(overrides: Partial<Parameters<typeof PayableEntry.create>[0]> = {}) {
  return PayableEntry.create({
    supplierName: "Fornecedor X",
    description: "Renda mensal",
    amount: 50000, // 500.00 €
    dueDate: new Date("2026-07-01"),
    ...overrides,
  });
}

describe("PayableEntry", () => {
  describe("create", () => {
    it("creates a pending entry with default recurrence=none", () => {
      const entry = makeEntry();
      expect(entry.status).toBe("pending");
      expect(entry.recurrence).toBe("none");
      expect(entry.paidAt).toBeNull();
      expect(entry.invoiceId).toBeNull();
    });

    it("throws when amount is zero", () => {
      expect(() => makeEntry({ amount: 0 })).toThrow("Amount must be greater than zero");
    });

    it("throws when amount is negative", () => {
      expect(() => makeEntry({ amount: -1 })).toThrow("Amount must be greater than zero");
    });

    it("throws when description is empty", () => {
      expect(() => makeEntry({ description: "   " })).toThrow("Description is required");
    });

    it("trims supplierName and description", () => {
      const entry = makeEntry({ supplierName: "  Fornecedor  ", description: "  Renda  " });
      expect(entry.supplierName).toBe("Fornecedor");
      expect(entry.description).toBe("Renda");
    });
  });

  describe("markPaid", () => {
    it("marks a pending entry as paid", () => {
      const entry = makeEntry();
      const paidAt = new Date("2026-07-05");
      const paid = entry.markPaid(paidAt);
      expect(paid.status).toBe("paid");
      expect(paid.paidAt).toEqual(paidAt);
    });

    it("marks an overdue entry as paid", () => {
      const entry = makeEntry().markOverdue();
      const paid = entry.markPaid(new Date("2026-07-10"));
      expect(paid.status).toBe("paid");
    });

    it("throws when trying to pay a cancelled entry", () => {
      const entry = makeEntry().cancel();
      expect(() => entry.markPaid(new Date())).toThrow("Cannot mark a cancelled payable entry as paid");
    });

    it("throws when already paid", () => {
      const entry = makeEntry().markPaid(new Date());
      expect(() => entry.markPaid(new Date())).toThrow("already paid");
    });
  });

  describe("markOverdue", () => {
    it("transitions pending to overdue", () => {
      const entry = makeEntry();
      expect(entry.markOverdue().status).toBe("overdue");
    });

    it("is a no-op for non-pending statuses", () => {
      const paid = makeEntry().markPaid(new Date());
      expect(paid.markOverdue().status).toBe("paid");
    });
  });

  describe("cancel", () => {
    it("cancels a pending entry", () => {
      const entry = makeEntry();
      expect(entry.cancel().status).toBe("cancelled");
    });

    it("throws when trying to cancel a paid entry", () => {
      const entry = makeEntry().markPaid(new Date());
      expect(() => entry.cancel()).toThrow("Cannot cancel a paid payable entry");
    });
  });

  describe("update", () => {
    it("updates allowed fields and returns new instance", () => {
      const entry = makeEntry();
      const updated = entry.update({ amount: 60000, description: "Renda nova" });
      expect(updated.amount).toBe(60000);
      expect(updated.description).toBe("Renda nova");
      expect(updated.id).toBe(entry.id);
    });

    it("throws when updating a cancelled entry", () => {
      const entry = makeEntry().cancel();
      expect(() => entry.update({ amount: 60000 })).toThrow("Cannot update a cancelled payable entry");
    });

    it("throws when updating amount to zero", () => {
      const entry = makeEntry();
      expect(() => entry.update({ amount: 0 })).toThrow("Amount must be greater than zero");
    });

    it("does not mutate the original instance", () => {
      const entry = makeEntry();
      entry.update({ amount: 99999 });
      expect(entry.amount).toBe(50000);
    });
  });
});
