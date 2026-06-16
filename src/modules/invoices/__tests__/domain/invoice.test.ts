import { Invoice } from "../../domain/entities/invoice.js";

const base = {
  supplierName: "Makro Portugal",
  invoiceNumber: "MKR-2026-001",
  invoiceDate: new Date("2026-06-01"),
  subtotalWithoutVat: 100000,
  totalVat: 23000,
  totalWithVat: 123000,
};

describe("Invoice entity", () => {
  it("creates with pending status and null paidAt", () => {
    const inv = Invoice.create(base);
    expect(inv.status).toBe("pending");
    expect(inv.paidAt).toBeNull();
    expect(inv.totalWithVat).toBe(123000);
    expect(inv.id).toBeDefined();
  });

  it("trims supplierName and invoiceNumber", () => {
    const inv = Invoice.create({ ...base, supplierName: "  EDP  ", invoiceNumber: " EDP-001 " });
    expect(inv.supplierName).toBe("EDP");
    expect(inv.invoiceNumber).toBe("EDP-001");
  });

  it("defaults supplierId to null", () => {
    const inv = Invoice.create(base);
    expect(inv.supplierId).toBeNull();
  });

  it("markPaid sets paidAt and status", () => {
    const inv = Invoice.create(base);
    const paid = inv.markPaid(new Date("2026-06-15"));
    expect(paid.status).toBe("paid");
    expect(paid.paidAt?.toISOString().slice(0, 10)).toBe("2026-06-15");
    // immutability
    expect(inv.status).toBe("pending");
    expect(inv.paidAt).toBeNull();
  });

  it("markPaid throws if invoice is cancelled", () => {
    const inv = Invoice.create(base).cancel();
    expect(() => inv.markPaid(new Date())).toThrow();
  });

  it("cancel returns new instance with cancelled status", () => {
    const inv = Invoice.create(base);
    const cancelled = inv.cancel();
    expect(cancelled.status).toBe("cancelled");
    expect(inv.status).toBe("pending");
  });

  it("update only changes provided fields", () => {
    const inv = Invoice.create(base);
    const updated = inv.update({ supplierName: "EDP", totalWithVat: 90100 });
    expect(updated.supplierName).toBe("EDP");
    expect(updated.totalWithVat).toBe(90100);
    expect(updated.invoiceNumber).toBe(inv.invoiceNumber);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(inv.updatedAt.getTime());
  });

  it("update accepts null for nullable fields", () => {
    const inv = Invoice.create({ ...base, dueDate: new Date("2026-07-01") });
    const updated = inv.update({ dueDate: null });
    expect(updated.dueDate).toBeNull();
  });

  it("reconstitute restores all fields exactly", () => {
    const original = Invoice.create(base);
    const copy = Invoice.reconstitute({
      id: original.id,
      supplierId: null,
      supplierName: original.supplierName,
      invoiceNumber: original.invoiceNumber,
      invoiceDate: original.invoiceDate,
      dueDate: null,
      paidAt: null,
      subtotalWithoutVat: original.subtotalWithoutVat,
      totalVat: original.totalVat,
      totalWithVat: original.totalWithVat,
      status: original.status,
      notes: null,
      attachmentUrl: null,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
    });
    expect(copy.id).toBe(original.id);
    expect(copy.supplierName).toBe(original.supplierName);
    expect(copy.createdAt).toEqual(original.createdAt);
  });
});
