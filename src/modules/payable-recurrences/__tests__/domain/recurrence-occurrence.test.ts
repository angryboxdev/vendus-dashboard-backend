import { RecurrenceOccurrence, computeOccurrenceDisplayState } from "../../domain/entities/recurrence-occurrence.js";
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

describe("computeOccurrenceDisplayState", () => {
  const TODAY = new Date("2026-09-25");

  it("cancelled tem prioridade sobre tudo", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).cancel();
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("cancelled");
  });

  it("awaiting_invoice quando requireInvoice=true e ainda sem fatura", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true, dueDate: new Date("2027-01-01") });
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("awaiting_invoice");
  });

  it("awaiting_payment quando pronta a pagar, vencimento no futuro, sem pagamento", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, dueDate: new Date("2027-01-01") });
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("awaiting_payment");
  });

  it("overdue quando vencimento já passou e continua sem pagamento", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, dueDate: new Date("2026-01-01") });
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("overdue");
  });

  it("partially_paid quando paidAmountCents > 0 mas abaixo do efectivo (fora da tolerância)", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, estimatedAmountCents: 100_000, dueDate: new Date("2027-01-01") });
    expect(computeOccurrenceDisplayState(occ, 50_000, TODAY)).toBe("partially_paid");
  });

  it("paid quando paidAmountCents cobre o efectivo dentro da tolerância de 100 cêntimos", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, estimatedAmountCents: 100_000, dueDate: new Date("2027-01-01") });
    expect(computeOccurrenceDisplayState(occ, 99_950, TODAY)).toBe("paid");
  });

  it("paid quando status já é 'paid', mesmo que paidAmountCents seja 0 (pagamento manual sem movimento bancário)", () => {
    const occ = RecurrenceOccurrence.create(BASE_PROPS).markPaid(new Date("2026-09-20"));
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("paid");
  });

  it("awaiting_payment para invoice_linked com vencimento no futuro", () => {
    const occ = RecurrenceOccurrence.create({ ...BASE_PROPS, requireInvoice: true, dueDate: new Date("2027-01-01") })
      .linkInvoice("inv-1", 26175);
    expect(computeOccurrenceDisplayState(occ, 0, TODAY)).toBe("awaiting_payment");
  });
});
