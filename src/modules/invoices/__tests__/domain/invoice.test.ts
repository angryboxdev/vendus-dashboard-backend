import { Invoice } from "../../domain/entities/invoice.js";

const base = {
  supplierName: "Makro Portugal",
  invoiceNumber: "MKR-2026-001",
  invoiceDate: new Date("2026-06-01"),
  subtotalWithoutVat: 100000,
  totalVat: 23000,
  totalWithVat: 123000,
};

const baseReconstitute = {
  supplierId: null,
  supplierNifSnapshot: null,
  dueDate: null,
  paidAt: null,
  isDirectDebit: false,
  directDebitDate: null,
  status: "pending" as const,
  reconciliationStatus: "none" as const,
  lineDetailMode: "simple" as const,
  paymentBankAccountId: null,
  competenceDate: null,
  notes: null,
  attachmentUrl: null,
  source: "manual" as const,
  aiExtractionStatus: null,
  aiConfidence: null,
  requiresReview: false,
  costCenterGroupId: null,
  costCenterCategoryId: null,
  financialType: null,
  affectsDre: true,
  affectsCashflow: true,
  affectsProfitability: false,
  currency: "EUR",
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

  it("markPaid sets paidAt, status=paid and reconciliationStatus=pending_reconciliation", () => {
    const inv = Invoice.create(base);
    const paid = inv.markPaid(new Date("2026-06-15"));
    expect(paid.status).toBe("paid");
    expect(paid.paidAt?.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(paid.reconciliationStatus).toBe("pending_reconciliation");
    // immutability
    expect(inv.status).toBe("pending");
    expect(inv.paidAt).toBeNull();
    expect(inv.reconciliationStatus).toBe("none");
  });

  it("markPaid stores bankAccountId when provided", () => {
    const inv = Invoice.create(base);
    const paid = inv.markPaid(new Date("2026-06-15"), "bank-123");
    expect(paid.paymentBankAccountId).toBe("bank-123");
  });

  it("markReconciled sets reconciliationStatus=reconciled", () => {
    const inv = Invoice.create(base).markPaid(new Date("2026-06-15"));
    const reconciled = inv.markReconciled();
    expect(reconciled.reconciliationStatus).toBe("reconciled");
    // immutability
    expect(inv.reconciliationStatus).toBe("pending_reconciliation");
  });

  it("setLineDetailMode toggles lineDetailMode", () => {
    const inv = Invoice.create(base);
    expect(inv.lineDetailMode).toBe("simple");
    const detailed = inv.setLineDetailMode("detailed");
    expect(detailed.lineDetailMode).toBe("detailed");
    expect(inv.lineDetailMode).toBe("simple");
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
      supplierName: original.supplierName,
      invoiceNumber: original.invoiceNumber,
      invoiceDate: original.invoiceDate,
      subtotalWithoutVat: original.subtotalWithoutVat,
      totalVat: original.totalVat,
      totalWithVat: original.totalWithVat,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      ...baseReconstitute,
    });
    expect(copy.id).toBe(original.id);
    expect(copy.supplierName).toBe(original.supplierName);
    expect(copy.createdAt).toEqual(original.createdAt);
    expect(copy.costCenterCategoryId).toBeNull();
    expect(copy.isDirectDebit).toBe(false);
    expect(copy.directDebitDate).toBeNull();
  });

  it("update accepts costCenterCategoryId", () => {
    const inv = Invoice.create(base);
    const updated = inv.update({ costCenterCategoryId: "cat-cmv" });
    expect(updated.costCenterCategoryId).toBe("cat-cmv");
    expect(inv.costCenterCategoryId).toBeNull();
  });

  // ── Direct Debit ──────────────────────────────────────────────────────────

  it("create() defaults isDirectDebit to false and directDebitDate to null", () => {
    const inv = Invoice.create(base);
    expect(inv.isDirectDebit).toBe(false);
    expect(inv.directDebitDate).toBeNull();
  });

  it("create() persists isDirectDebit and directDebitDate when provided", () => {
    const debitDate = new Date("2026-08-01");
    const inv = Invoice.create({ ...base, isDirectDebit: true, directDebitDate: debitDate });
    expect(inv.isDirectDebit).toBe(true);
    expect(inv.directDebitDate).toEqual(debitDate);
  });

  it("createFromImport() always starts with isDirectDebit=false and directDebitDate=null", () => {
    const inv = Invoice.createFromImport({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
      source: "pdf_import",
      aiConfidence: 0.9,
      requiresReview: false,
    });
    expect(inv.isDirectDebit).toBe(false);
    expect(inv.directDebitDate).toBeNull();
  });

  it("update() changes isDirectDebit and directDebitDate", () => {
    const inv = Invoice.create(base);
    const debitDate = new Date("2026-09-15");
    const updated = inv.update({ isDirectDebit: true, directDebitDate: debitDate });
    expect(updated.isDirectDebit).toBe(true);
    expect(updated.directDebitDate).toEqual(debitDate);
    // immutability
    expect(inv.isDirectDebit).toBe(false);
  });

  it("update() clears directDebitDate when set to null", () => {
    const debitDate = new Date("2026-09-15");
    const inv = Invoice.create({ ...base, isDirectDebit: true, directDebitDate: debitDate });
    const updated = inv.update({ isDirectDebit: false, directDebitDate: null });
    expect(updated.isDirectDebit).toBe(false);
    expect(updated.directDebitDate).toBeNull();
  });

  it("confirmImport() propagates isDirectDebit and directDebitDate", () => {
    const inv = Invoice.createFromImport({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
      source: "pdf_import",
      aiConfidence: 0.9,
      requiresReview: false,
    });
    const debitDate = new Date("2026-08-10");
    const confirmed = inv.confirmImport({ isDirectDebit: true, directDebitDate: debitDate });
    expect(confirmed.isDirectDebit).toBe(true);
    expect(confirmed.directDebitDate).toEqual(debitDate);
    expect(confirmed.status).toBe("pending");
  });
});
