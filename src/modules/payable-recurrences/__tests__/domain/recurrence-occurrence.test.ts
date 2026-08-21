import { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import { OccurrenceInvalidTransitionError, OccurrenceInvoiceRequiredError } from "../../domain/errors.js";

const BASE_PROPS = {
  recurrenceId: "rec-1",
  period: "2026-09",
  estimatedAmountCents: 26175,
  dueDate: new Date("2026-09-20"),
  requireInvoice: false,
};

const PAID_AT = new Date("2026-09-20");

describe("RecurrenceOccurrence.create", () => {
  it("cria ocorrência com status forecast quando requireInvoice=false", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS);
    expect(occ.status).toBe("forecast");
    expect(occ.invoiceId).toBeNull();
    expect(occ.paidAt).toBeNull();
    expect(occ.paymentMethod).toBeNull();
    expect(occ.realAmountCents).toBeNull();
  });

  it("cria ocorrência com status awaiting_invoice quando requireInvoice=true", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true });
    expect(occ.status).toBe("awaiting_invoice");
  });

  it("effectiveAmountCents retorna estimado quando real é null", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS);
    expect(occ.effectiveAmountCents).toBe(26175);
  });
});

describe("RecurrenceOccurrence.linkInvoice", () => {
  it("liga fatura de forecast → invoice_linked", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).linkInvoice("inv-1", 28000);
    expect(occ.status).toBe("invoice_linked");
    expect(occ.invoiceId).toBe("inv-1");
    expect(occ.realAmountCents).toBe(28000);
    expect(occ.effectiveAmountCents).toBe(28000);
  });

  it("liga fatura de awaiting_invoice → invoice_linked", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true }).linkInvoice("inv-1", 28000);
    expect(occ.status).toBe("invoice_linked");
  });

  it("lança erro se realAmountCents <= 0", () => {
    expect(() => RecurrenceOccurrence.create(BASE_PROPS).linkInvoice("inv-1", 0)).toThrow("realAmountCents must be greater than zero");
  });

  it("lança OccurrenceInvalidTransitionError se já está paid", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).markPaid(PAID_AT);
    expect(() => occ.linkInvoice("inv-1", 100)).toThrow(OccurrenceInvalidTransitionError);
  });
});

describe("RecurrenceOccurrence.markPaid", () => {
  it("transita de forecast → paid (requireInvoice=false)", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).markPaid(PAID_AT, "transfer");
    expect(occ.status).toBe("paid");
    expect(occ.paidAt).toBe(PAID_AT);
    expect(occ.paymentMethod).toBe("transfer");
  });

  it("transita de invoice_linked → paid", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS)
      .linkInvoice("inv-1", 28000)
      .markPaid(PAID_AT);
    expect(occ.status).toBe("paid");
  });

  it("lança OccurrenceInvoiceRequiredError se requireInvoice=true e fatura não vinculada", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true });
    expect(() => occ.markPaid(PAID_AT)).toThrow(OccurrenceInvoiceRequiredError);
  });

  it("lança OccurrenceInvalidTransitionError se já está paid", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).markPaid(PAID_AT);
    expect(() => occ.markPaid(PAID_AT)).toThrow(OccurrenceInvalidTransitionError);
  });

  it("lança OccurrenceInvalidTransitionError se está cancelled", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).cancel();
    expect(() => occ.markPaid(PAID_AT)).toThrow(OccurrenceInvalidTransitionError);
  });
});

describe("RecurrenceOccurrence.cancel", () => {
  it("cancela ocorrência em forecast", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).cancel();
    expect(occ.status).toBe("cancelled");
    expect(occ.isTerminal()).toBe(true);
  });

  it("cancela ocorrência em awaiting_invoice", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true }).cancel();
    expect(occ.status).toBe("cancelled");
  });

  it("lança erro ao cancelar paid", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).markPaid(PAID_AT);
    expect(() => occ.cancel()).toThrow(OccurrenceInvalidTransitionError);
  });

  it("lança erro ao cancelar já cancelado", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).cancel();
    expect(() => occ.cancel()).toThrow(OccurrenceInvalidTransitionError);
  });
});
