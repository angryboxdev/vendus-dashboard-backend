import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { ConfirmStockPurchaseReviewUseCase } from "../../application/use-cases/confirm-stock-purchase-review.use-case.js";
import { StaleInvoiceSnapshotError, LocationRequiredError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeInvoiceRead, invoiceSnapshotStub } from "../fakes/fake-invoice-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { computeInvoiceSourceHash } from "../../application/use-cases/shared.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockPurchaseReviewRepository();
  const stockMovementWrite = new FakeStockMovementWrite(repository);
  const invoiceRead = new FakeInvoiceRead();
  const locationRead = new FakeLocationRead();
  const auditLog = new FakeStockReviewAuditLog();
  const useCase = new ConfirmStockPurchaseReviewUseCase(repository, stockMovementWrite, invoiceRead, locationRead, auditLog);
  return { repository, stockMovementWrite, invoiceRead, locationRead, auditLog, useCase };
}

function seedReadyReview(repository: FakeStockPurchaseReviewRepository, sourceHash: string) {
  const review = StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash,
    decisionSource: "category",
    decisionPolicyUsed: "CREATE_REVIEW",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
  })
    .startReview()
    .refreshLinesProgress(true, true);
  repository.seedReview(review);
  return review;
}

describe("ConfirmStockPurchaseReviewUseCase", () => {
  it("confirma com sucesso quando a fatura não mudou desde a criação da revisão", async () => {
    const { repository, invoiceRead, locationRead, useCase } = makeUseCase();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const review = seedReadyReview(repository, hash);
    invoiceRead.invoices.set("inv-1", invoice);
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];

    const dto = await useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "user@fonsat.pt" });

    expect(dto.status).toBe("applied");
  });

  it("lança StaleInvoiceSnapshotError quando a fatura mudou desde a criação da revisão", async () => {
    const { repository, invoiceRead, useCase } = makeUseCase();
    const review = seedReadyReview(repository, "hash-antigo");
    invoiceRead.invoices.set("inv-1", invoiceSnapshotStub({ id: "inv-1", totalWithVat: 999 }));

    await expect(
      useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "user@fonsat.pt" }),
    ).rejects.toThrow(StaleInvoiceSnapshotError);
  });

  it("exige loja explícita quando há mais que uma loja ativa e nenhuma linha tem loja própria", async () => {
    const { repository, invoiceRead, locationRead, useCase } = makeUseCase();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const review = seedReadyReview(repository, hash);
    invoiceRead.invoices.set("inv-1", invoice);
    locationRead.locations = [
      { id: "loc-1", name: "Loja MBS", isActive: true },
      { id: "loc-2", name: "Loja Gaia", isActive: true },
    ];

    await expect(
      useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "user@fonsat.pt" }),
    ).rejects.toThrow(LocationRequiredError);
  });

  it("com uma única loja ativa, seleciona-a automaticamente sem perguntar", async () => {
    const { repository, invoiceRead, locationRead, stockMovementWrite, useCase } = makeUseCase();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const review = seedReadyReview(repository, hash);
    invoiceRead.invoices.set("inv-1", invoice);
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];

    await useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "user@fonsat.pt" });

    expect(stockMovementWrite.confirmCalls[0]?.fallbackLocationId).toBe("loc-1");
  });

  it("duplo clique / retry: a segunda confirmação devolve o mesmo resultado, sem duplicar", async () => {
    const { repository, invoiceRead, locationRead, useCase } = makeUseCase();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const review = seedReadyReview(repository, hash);
    invoiceRead.invoices.set("inv-1", invoice);
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];

    const first = await useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "user@fonsat.pt" });
    // Na 2ª tentativa a revisão já está applied — o fake simula o curto-circuito da RPC real (alreadyApplied).
    const second = await useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: first.version, actor: "user@fonsat.pt" });

    expect(first.status).toBe("applied");
    expect(second.status).toBe("applied");
  });
});
