import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { CancellationReasonRequiredError, ReviewAlreadyAppliedError, ReviewAlreadyCancelledError } from "../../domain/errors.js";

function baseProps() {
  return {
    organizationId: "org-1",
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash: "hash-1",
    decisionSource: "category" as const,
    decisionPolicyUsed: "CREATE_REVIEW",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
  };
}

describe("StockPurchaseReview.create", () => {
  it("começa sempre em pending, versão 1", () => {
    const review = StockPurchaseReview.create(baseProps());
    expect(review.status).toBe("pending");
    expect(review.version).toBe(1);
  });
});

describe("StockPurchaseReview — transições de estado", () => {
  it("startReview() muda para in_review e incrementa a versão", () => {
    const review = StockPurchaseReview.create(baseProps());
    const started = review.startReview();
    expect(started.status).toBe("in_review");
    expect(started.version).toBe(2);
  });

  it("refreshLinesProgress: nenhuma resolvida mantém o estado, todas resolvidas fica ready, parcial fica partial", () => {
    const review = StockPurchaseReview.create(baseProps()).startReview();
    const stillInReview = review.refreshLinesProgress(false, false);
    expect(stillInReview.status).toBe("in_review");
    const partial = review.refreshLinesProgress(false, true);
    expect(partial.status).toBe("partial");
    const ready = review.refreshLinesProgress(true, true);
    expect(ready.status).toBe("ready");
  });

  it("cancel() exige motivo e nunca apaga a revisão (soft state)", () => {
    const review = StockPurchaseReview.create(baseProps());
    expect(() => review.cancel("")).toThrow(CancellationReasonRequiredError);
    const cancelled = review.cancel("Duplicado");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.toProps().cancellationReason).toBe("Duplicado");
  });

  it("cancel() depois de applied lança ReviewAlreadyAppliedError", () => {
    const review = StockPurchaseReview.create(baseProps()).startReview().refreshLinesProgress(true, true).apply();
    expect(() => review.cancel("motivo")).toThrow(ReviewAlreadyAppliedError);
  });

  it("cancel() duas vezes lança ReviewAlreadyCancelledError", () => {
    const review = StockPurchaseReview.create(baseProps()).cancel("motivo");
    expect(() => review.cancel("outro motivo")).toThrow(ReviewAlreadyCancelledError);
  });

  it("apply() só a partir de ready", () => {
    const review = StockPurchaseReview.create(baseProps()).startReview();
    expect(() => review.apply()).toThrow();
    const ready = review.refreshLinesProgress(true, true);
    const applied = ready.apply();
    expect(applied.status).toBe("applied");
  });

  it("decideUnresolved(create) sai do estado unresolved para in_review, auditável", () => {
    const review = StockPurchaseReview.create({ ...baseProps(), decisionSource: "unresolved", decisionPolicyUsed: "no_signal" });
    const decided = review.decideUnresolved("create", "manager@fonsat.pt");
    expect(decided.status).toBe("in_review");
    expect(decided.decisionSource).toBe("override");
    expect(decided.toProps().decisionActor).toBe("manager@fonsat.pt");
  });

  it("decideUnresolved(skip) cancela a revisão, nunca gera movimento", () => {
    const review = StockPurchaseReview.create({ ...baseProps(), decisionSource: "unresolved", decisionPolicyUsed: "no_signal" });
    const decided = review.decideUnresolved("skip", "manager@fonsat.pt");
    expect(decided.status).toBe("cancelled");
  });
});
