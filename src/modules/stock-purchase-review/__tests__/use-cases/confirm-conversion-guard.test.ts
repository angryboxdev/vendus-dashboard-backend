import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { ConfirmStockPurchaseReviewUseCase } from "../../application/use-cases/confirm-stock-purchase-review.use-case.js";
import { SuspiciousConversionError } from "../../domain/errors.js";
import { invoiceLineToStock, invoiceQuantityUnit, type PresentationShape } from "../../domain/services/presentation-conversion.service.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";

const ORG = mintOrganizationId("org-test");

describe("unidade da fatura (mozzarella faturada em kg com o saco configurado em g)", () => {
  test("lê a unidade da linha ou a unidade solta no fim da descrição, nunca um tamanho", () => {
    expect(invoiceQuantityUnit("un", "Q. Mozzarella ralado 100% Eurial kg")).toBe("kg");
    expect(invoiceQuantityUnit("KG", "Farinha")).toBe("kg");
    expect(invoiceQuantityUnit("un", "Farinha tipo 00 25 kg")).toBeNull();
    expect(invoiceQuantityUnit("un", "Farinha 25kg")).toBeNull();
    expect(invoiceQuantityUnit("un", "Água das Pedras")).toBeNull();
    expect(invoiceQuantityUnit("cx", "Leite meio gordo lt")).toBe("l");
  });

  test("saco de 2500 g, fatura conta o conteúdo em kg → 20 kg = 20 000 g, 8 sacos, 0,00558 €/g", () => {
    const saco2500g: PresentationShape = { packageUnit: "saco", contentQuantity: 2500, contentUnit: "g", invoicedBy: "content", minOrderPackages: 1, orderIncrementPackages: 1 };
    expect(invoiceLineToStock(saco2500g, 20, 11160, "g", "kg")).toEqual({
      conversionFactor: 1000, stockQuantity: 20000, packages: 8, netCostPerBaseUnit: 0.558, netCostPerContentUnit: 0.558, netCostPerPackage: 1395,
    });
    // Sem unidade conhecida mantém o comportamento anterior (quantidade na unidade do conteúdo).
    expect(invoiceLineToStock(saco2500g, 20, 11160, "g")).toMatchObject({ conversionFactor: 1, stockQuantity: 20 });
  });
});

describe("travão na confirmação", () => {
  function setup(conversionFactor: number) {
    const repository = new FakeStockPurchaseReviewRepository();
    const catalog = new FakeStockCatalogWrite();
    catalog.seed({ id: "mozz", name: "Mozzarela Ralado", baseUnit: "g", isActive: true });
    const review = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category",
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Dream Plus", invoiceNumber: "FT 1", invoiceDate: "2026-10-08",
    }).startReview().refreshLinesProgress(true, true);
    repository.seedReview(review);
    repository.seedLines([
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "l1", description: "Q. Mozzarella ralado 100% Eurial kg", purchaseQuantity: 20, purchaseUnit: "un", unitCostWithoutVat: 558, totalWithVat: 11830, vatAmount: 670, supplierItemCode: "44641004" })
        .resolveToStockItem({ stockItemId: "mozz", conversionFactor, isItemActive: true, locationId: "loc-1" }, false, "gestor@teste.pt"),
    ]);
    const useCase = new ConfirmStockPurchaseReviewUseCase(repository, new FakeStockMovementWrite(repository), new FakeInvoiceRead(), new FakeLocationRead(), new FakeStockReviewAuditLog(), undefined, catalog);
    return { review, useCase };
  }

  test("fatura em kg com 1 kg = 1 g → recusa com a explicação", async () => {
    const { review, useCase } = setup(1);
    await expect(useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" })).rejects.toBeInstanceOf(SuspiciousConversionError);
    await expect(useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" })).rejects.toThrow(/deve ser pelo menos 1000 g/);
  });

  test("fatura em kg com 1 kg = 1000 g → confirma", async () => {
    const { review, useCase } = setup(1000);
    const dto = await useCase.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" });
    expect(dto.status).toBe("applied");
  });
});
