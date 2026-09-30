import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { ResolveReviewLineUseCase } from "../../application/use-cases/resolve-review-line.use-case.js";
import { InactiveStockItemReferencedError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockPurchaseReviewRepository();
  const stockCatalogWrite = new FakeStockCatalogWrite();
  const learnedMapping = new FakeStockReviewLearnedMapping();
  const auditLog = new FakeStockReviewAuditLog();
  const useCase = new ResolveReviewLineUseCase(repository, stockCatalogWrite, learnedMapping, auditLog);
  return { repository, stockCatalogWrite, learnedMapping, auditLog, useCase };
}

function seedReviewWithLine(repository: FakeStockPurchaseReviewRepository) {
  const review = StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash: "hash-1",
    decisionSource: "category",
    decisionSupplierId: "sup-1",
    decisionPolicyUsed: "CREATE_REVIEW",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
  }).startReview();
  const line = StockReviewLine.create({
    organizationId: ORG,
    reviewId: review.id,
    invoiceLineId: "line-1",
    description: "Mozzarella",
    purchaseQuantity: 2,
    purchaseUnit: "kg",
    unitCostWithoutVat: 10,
    totalWithVat: 24.6,
  });
  repository.seedReview(review);
  repository.seedLines([line]);
  return { review, line };
}

describe("ResolveReviewLineUseCase", () => {
  it("existing_item calcula stockQuantity e marca a linha resolvida", async () => {
    const { repository, stockCatalogWrite, useCase } = makeUseCase();
    const { review, line } = seedReviewWithLine(repository);
    stockCatalogWrite.seed({ id: "item-1", name: "Mozzarella Ralado", baseUnit: "g", isActive: true });

    const dto = await useCase.execute({
      organizationId: ORG,
      reviewId: review.id,
      lineId: line.id,
      expectedVersion: review.version,
      resolution: "existing_item",
      stockItemId: "item-1",
      conversionFactor: 1000,
      actor: "user@fonsat.pt",
    });

    const resolvedLine = dto.lines.find((l) => l.id === line.id)!;
    expect(resolvedLine.resolutionType).toBe("existing_item");
    expect(resolvedLine.stockQuantity).toBe(2000);
  });

  it("new_item cria o item de stock (quantidade 0 implícita) antes de resolver a linha", async () => {
    const { repository, stockCatalogWrite, useCase } = makeUseCase();
    const { review, line } = seedReviewWithLine(repository);

    const dto = await useCase.execute({
      organizationId: ORG,
      reviewId: review.id,
      lineId: line.id,
      expectedVersion: review.version,
      resolution: "new_item",
      newItem: { name: "Mozzarella Ralado", categoryId: "cat-1", type: "ingredient", baseUnit: "g" },
      conversionFactor: 1000,
      actor: "user@fonsat.pt",
    });

    expect(stockCatalogWrite.items.size).toBe(1);
    const resolvedLine = dto.lines.find((l) => l.id === line.id)!;
    expect(resolvedLine.resolutionType).toBe("new_item");
  });

  it("rejeita item inativo", async () => {
    const { repository, stockCatalogWrite, useCase } = makeUseCase();
    const { review, line } = seedReviewWithLine(repository);
    stockCatalogWrite.seed({ id: "item-1", name: "Item Inativo", baseUnit: "g", isActive: false });

    await expect(
      useCase.execute({
        organizationId: ORG,
        reviewId: review.id,
        lineId: line.id,
        expectedVersion: review.version,
        resolution: "existing_item",
        stockItemId: "item-1",
        conversionFactor: 1000,
        actor: "user@fonsat.pt",
      }),
    ).rejects.toThrow(InactiveStockItemReferencedError);
  });

  it("no_stock_effect aprende a regra (fornecedor + descrição) para a próxima ocorrência", async () => {
    const { repository, learnedMapping, useCase } = makeUseCase();
    const { review, line } = seedReviewWithLine(repository);

    await useCase.execute({
      organizationId: ORG,
      reviewId: review.id,
      lineId: line.id,
      expectedVersion: review.version,
      resolution: "no_stock_effect",
      actor: "user@fonsat.pt",
    });

    expect(learnedMapping.learned).toHaveLength(1);
    expect(learnedMapping.learned[0]?.resolutionType).toBe("no_stock_effect");
  });

  it("quando todas as linhas ficam resolvidas, a revisão passa a ready", async () => {
    const { repository, stockCatalogWrite, useCase } = makeUseCase();
    const { review, line } = seedReviewWithLine(repository);
    stockCatalogWrite.seed({ id: "item-1", name: "Mozzarella Ralado", baseUnit: "g", isActive: true });

    const dto = await useCase.execute({
      organizationId: ORG,
      reviewId: review.id,
      lineId: line.id,
      expectedVersion: review.version,
      resolution: "existing_item",
      stockItemId: "item-1",
      conversionFactor: 1000,
      actor: "user@fonsat.pt",
    });

    expect(dto.status).toBe("ready");
  });
});
