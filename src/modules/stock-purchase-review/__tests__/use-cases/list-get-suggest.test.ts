import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { ListStockPurchaseReviewsUseCase } from "../../application/use-cases/list-stock-purchase-reviews.use-case.js";
import { GetStockPurchaseReviewUseCase } from "../../application/use-cases/get-stock-purchase-review.use-case.js";
import { SuggestLineMappingUseCase } from "../../application/use-cases/suggest-line-mapping.use-case.js";
import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";

const ORG = mintOrganizationId("org-test");

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
  });
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

describe("ListStockPurchaseReviewsUseCase", () => {
  it("devolve as linhas com a contagem de linhas físicas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    seedReviewWithLine(repository);
    const useCase = new ListStockPurchaseReviewsUseCase(repository);

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.linesCount).toBe(1);
  });
});

describe("GetStockPurchaseReviewUseCase", () => {
  it("lança StockPurchaseReviewNotFoundError quando o id não existe", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const useCase = new GetStockPurchaseReviewUseCase(repository);
    await expect(useCase.execute({ organizationId: ORG, id: "missing" })).rejects.toThrow(StockPurchaseReviewNotFoundError);
  });

  it("devolve a revisão com as suas linhas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review } = seedReviewWithLine(repository);
    const useCase = new GetStockPurchaseReviewUseCase(repository);

    const dto = await useCase.execute({ organizationId: ORG, id: review.id });

    expect(dto.lines).toHaveLength(1);
  });
});

describe("SuggestLineMappingUseCase", () => {
  it("devolve null quando não há mapeamento aprendido", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review, line } = seedReviewWithLine(repository);
    const learnedMapping = new FakeStockReviewLearnedMapping();
    const useCase = new SuggestLineMappingUseCase(repository, learnedMapping);

    const suggestion = await useCase.execute({ organizationId: ORG, reviewId: review.id, lineId: line.id });

    expect(suggestion).toBeNull();
  });

  it("devolve a sugestão aprendida sem nunca a aplicar sozinha", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review, line } = seedReviewWithLine(repository);
    const learnedMapping = new FakeStockReviewLearnedMapping();
    learnedMapping.learned.push({
      supplierId: "sup-1",
      supplierReference: null,
      normalizedDescription: "mozzarella",
      resolutionType: "existing_item",
      stockItemId: "item-1",
      conversionFactor: 1000,
      purchaseUnit: "kg",
    });
    learnedMapping.activeItemIds.add("item-1");
    const useCase = new SuggestLineMappingUseCase(repository, learnedMapping);

    const suggestion = await useCase.execute({ organizationId: ORG, reviewId: review.id, lineId: line.id });

    expect(suggestion).toEqual({
      resolutionType: "existing_item",
      stockItemId: "item-1",
      conversionFactor: 1000,
      purchaseUnit: "kg",
      isItemActive: true,
    });
    // A sugestão nunca resolve a linha sozinha — continua unresolved.
    const lines = await repository.findLinesByReviewId(ORG, review.id);
    expect(lines[0]?.resolutionType).toBe("unresolved");
  });
});
